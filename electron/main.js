'use strict';

const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { machineIdSync } = require('node-machine-id');

// ── Constants ─────────────────────────────────────────────────────────────────
const LICENSE_SERVER  = 'https://north-os-production.up.railway.app';
const APP_PORT        = 9847;
const GRACE_DAYS      = 7;
const HEALTH_URL      = `http://127.0.0.1:${APP_PORT}/api/v1/ping`;
const APP_URL         = `http://127.0.0.1:${APP_PORT}`;
const IS_DEV          = !!process.env.ELECTRON_DEV;
const IS_WIN          = process.platform === 'win32';
const IS_MAC          = process.platform === 'darwin';

// ── Global state ──────────────────────────────────────────────────────────────
let mainWindow       = null;
let activationWindow = null;
let backendProcess   = null;
let machineId        = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function activationFilePath() {
  return path.join(app.getPath('userData'), 'activation.json');
}

function readActivation() {
  try {
    const raw = fs.readFileSync(activationFilePath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeActivation(data) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(activationFilePath(), JSON.stringify(data, null, 2), 'utf8');
}

function clearActivation() {
  try { fs.unlinkSync(activationFilePath()); } catch { /* ignore */ }
}

function daysSince(isoString) {
  if (!isoString) return Infinity;
  return (Date.now() - new Date(isoString).getTime()) / 86_400_000;
}

// ── Backend process ───────────────────────────────────────────────────────────

function getBackendExecutable() {
  if (IS_DEV) return null; // In dev, backend is started separately

  const binaryName = IS_WIN ? 'personal-os-backend.exe' : 'personal-os-backend';
  return path.join(
    process.resourcesPath,
    'backend',
    'personal-os-backend',
    binaryName,
  );
}

function startBackend() {
  return new Promise((resolve, reject) => {
    if (IS_DEV) {
      console.log('[electron] Dev mode — skipping backend spawn (run uvicorn separately)');
      return resolve();
    }

    const exe = getBackendExecutable();
    if (!fs.existsSync(exe)) {
      return reject(new Error(`Backend binary not found: ${exe}`));
    }

    const dataDir = path.join(app.getPath('userData'), 'data');
    fs.mkdirSync(dataDir, { recursive: true });

    backendProcess = spawn(exe, [], {
      env: {
        ...process.env,
        APP_PORT:               String(APP_PORT),
        APP_HOST:               '127.0.0.1',
        // Distinct from cloud "production": still serves the static
        // frontend build, but also allows the no-token local-user auth
        // fallback (see auth_service.get_current_user) since this is a
        // single-user local install, not a multi-tenant server.
        APP_ENV:                'desktop',
        APP_VERSION:            app.getVersion(),
        DB_ENCRYPTION:          'false',
        PERSONAL_OS_DATA_DIR:   dataDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Collect stderr so we can show it if startup fails
    let stderrBuffer = '';
    backendProcess.stdout.on('data', (d) => process.stdout.write(`[backend] ${d}`));
    backendProcess.stderr.on('data', (d) => {
      process.stderr.write(`[backend] ${d}`);
      stderrBuffer += d.toString();
      if (stderrBuffer.length > 4000) stderrBuffer = stderrBuffer.slice(-4000);
    });

    backendProcess.on('error', (err) => {
      console.error('[electron] Backend process error:', err);
      reject(err);
    });

    let earlyExit = false;
    backendProcess.on('exit', (code, signal) => {
      earlyExit = true;
      console.log(`[electron] Backend exited — code=${code} signal=${signal}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        dialog.showErrorBox(
          'Personal OS — Backend stopped',
          `The backend process exited unexpectedly (code ${code}).\nPlease restart the app.`,
        );
      }
    });

    // Poll health endpoint until ready (30s timeout)
    let attempts = 0;
    const MAX_ATTEMPTS = 60; // 60 × 500ms = 30s

    const poll = setInterval(async () => {
      attempts++;

      // If backend already exited, stop polling immediately
      if (earlyExit) {
        clearInterval(poll);
        const detail = stderrBuffer.trim()
          ? `\n\nError output:\n${stderrBuffer.trim().slice(-1500)}`
          : '';
        reject(new Error(`Backend process exited before becoming ready.${detail}`));
        return;
      }

      try {
        const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          clearInterval(poll);
          console.log('[electron] Backend ready');
          resolve();
        }
      } catch { /* not ready yet */ }

      if (attempts >= MAX_ATTEMPTS) {
        clearInterval(poll);
        const detail = stderrBuffer.trim()
          ? `\n\nLast output:\n${stderrBuffer.trim().slice(-1500)}`
          : '';
        reject(new Error(`Backend did not start within 30 seconds.${detail}`));
      }
    }, 500);
  });
}

function stopBackend() {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
}

// ── License activation ────────────────────────────────────────────────────────

async function verifyWithServer(key) {
  const res = await fetch(`${LICENSE_SERVER}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, machine_id: machineId }),
    signal: AbortSignal.timeout(8000),
  });
  return res.json(); // { valid: bool, reason?: string }
}

async function activateWithServer(key) {
  const res = await fetch(`${LICENSE_SERVER}/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, machine_id: machineId }),
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Activation failed');
  return data; // { ok: true, message: "..." }
}

/**
 * Returns true if we should allow the app to open.
 * Handles: valid key, grace period, revoked.
 */
async function checkLicense() {
  const stored = readActivation();
  if (!stored?.key) return false; // never activated

  try {
    const result = await verifyWithServer(stored.key);

    if (result.valid) {
      // Refresh last_verified
      writeActivation({ ...stored, lastVerified: new Date().toISOString() });
      return true;
    }

    if (result.reason === 'revoked') {
      dialog.showErrorBox(
        'License Revoked',
        'Your Personal OS license has been revoked.\nPlease contact the app owner.',
      );
      clearActivation();
      return false;
    }

    // wrong_device or invalid_key — treat as not activated
    clearActivation();
    return false;

  } catch (err) {
    // Network error — apply grace period
    const days = daysSince(stored.lastVerified);
    if (days <= GRACE_DAYS) {
      console.warn(`[license] Server unreachable — grace period (${days.toFixed(1)}d / ${GRACE_DAYS}d)`);
      return true;
    }
    dialog.showErrorBox(
      'License Verification Failed',
      `Personal OS cannot verify your license (server unreachable).\n` +
      `Grace period expired ${Math.floor(days - GRACE_DAYS)} day(s) ago.\n\n` +
      `Please connect to the internet and restart the app.`,
    );
    return false;
  }
}

// ── Windows ───────────────────────────────────────────────────────────────────

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'default',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (IS_DEV) mainWindow.webContents.openDevTools();
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  // Open external links in the system browser, not in Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createActivationWindow() {
  activationWindow = new BrowserWindow({
    width: 480,
    height: 520,
    resizable: false,
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'default',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  activationWindow.loadFile(path.join(__dirname, 'activation.html'));
  activationWindow.once('ready-to-show', () => activationWindow.show());
  activationWindow.on('closed', () => { activationWindow = null; });
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('get-version', () => app.getVersion());

ipcMain.handle('activate', async (_event, key) => {
  const trimmedKey = String(key).trim().toUpperCase();
  try {
    await activateWithServer(trimmedKey);
    writeActivation({
      key: trimmedKey,
      machineId,
      activatedAt: new Date().toISOString(),
      lastVerified: new Date().toISOString(),
    });

    // Close activation window, open main app
    if (activationWindow && !activationWindow.isDestroyed()) {
      activationWindow.close();
    }
    createMainWindow();
    checkForUpdates();

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || 'Activation failed' };
  }
});

// ── Updater logging ───────────────────────────────────────────────────────────

let _logPath = null;
function updaterLog(level, msg) {
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${msg}\n`;
  console.log('[updater]', msg);
  try {
    if (!_logPath) _logPath = path.join(app.getPath('userData'), 'updater.log');
    try {
      const stat = fs.statSync(_logPath);
      if (stat.size > 200_000) fs.writeFileSync(_logPath, line, 'utf8');
      else fs.appendFileSync(_logPath, line, 'utf8');
    } catch {
      fs.writeFileSync(_logPath, line, 'utf8');
    }
  } catch { /* never crash because of logging */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getActiveWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  return BrowserWindow.getFocusedWindow()
    ?? BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
    ?? null;
}

/** Returns true if semver a > b  e.g. semverGt('1.0.10', '1.0.9') === true */
function semverGt(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

// ── macOS updater — downloads & installs the DMG internally ──────────────────
//
// Browser-downloaded DMGs get the com.apple.quarantine flag → Gatekeeper blocks.
// Downloads initiated by the running app do NOT get quarantined.
// So we: fetch DMG ourselves → mount → ditto to Applications → strip xattr →
// unmount → relaunch. No xattr command needed by the user, ever.

const { exec } = require('child_process');
const os       = require('os');

function execAsync(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stdout, stderr }));
      else resolve(stdout);
    });
  });
}

async function downloadDmg(url, destPath, onProgress) {
  updaterLog('info', `[mac] Downloading ${url}`);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PersonalOS-Updater' },
    signal: AbortSignal.timeout(600_000), // 10 min
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading DMG`);

  const total    = parseInt(res.headers.get('content-length') || '0', 10);
  const writer   = fs.createWriteStream(destPath);
  const reader   = res.body.getReader();
  let received   = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await new Promise((res, rej) => writer.write(value, (e) => e ? rej(e) : res()));
      received += value.length;
      if (total > 0 && onProgress) onProgress(received / total);
    }
  } finally {
    await new Promise((res, rej) => writer.close((e) => e ? rej(e) : res()));
  }
}

async function installMacUpdate(dmgUrl, version) {
  const win     = getActiveWindow();
  const tmpDmg  = path.join(os.tmpdir(), `personal-os-${version}.dmg`);

  // ── 1. Download ────────────────────────────────────────────────────
  try {
    await downloadDmg(dmgUrl, tmpDmg, (pct) => {
      const p = Math.round(pct * 100);
      updaterLog('info', `[mac] Download ${p}%`);
      if (win && !win.isDestroyed()) {
        win.setProgressBar(pct);
        win.setTitle(`Personal OS — Downloading update ${p}%`);
      }
    });
  } catch (err) {
    try { fs.unlinkSync(tmpDmg); } catch {}
    throw new Error(`Download failed: ${err.message}`);
  }

  if (win && !win.isDestroyed()) { win.setProgressBar(-1); win.setTitle('Personal OS — Installing…'); }

  // ── 2. Mount DMG ───────────────────────────────────────────────────
  updaterLog('info', '[mac] Mounting DMG…');
  let mountPoint;
  try {
    const out = await execAsync(`hdiutil attach "${tmpDmg}" -nobrowse -noverify -noautoopen -plist`);
    // Parse plist: find mount-point value
    const m = out.match(/<key>mount-point<\/key>\s*<string>([^<]+)<\/string>/);
    if (!m) throw new Error('Could not parse mount point from hdiutil output');
    mountPoint = m[1].trim();
    updaterLog('info', `[mac] Mounted at ${mountPoint}`);
  } catch (err) {
    try { fs.unlinkSync(tmpDmg); } catch {}
    throw new Error(`Mount failed: ${err.message}`);
  }

  // ── 3. Find .app inside DMG ────────────────────────────────────────
  let appInDmg;
  try {
    const entries = fs.readdirSync(mountPoint);
    const appName = entries.find((e) => e.endsWith('.app'));
    if (!appName) throw new Error('No .app found in DMG');
    appInDmg = path.join(mountPoint, appName);
    updaterLog('info', `[mac] App in DMG: ${appInDmg}`);
  } catch (err) {
    await execAsync(`hdiutil detach "${mountPoint}" -quiet -force`).catch(() => {});
    try { fs.unlinkSync(tmpDmg); } catch {}
    throw new Error(`Find app failed: ${err.message}`);
  }

  // Destination: same directory as currently running app
  const currentBundle = path.normalize(path.join(process.execPath, '../../..'));
  const appDest       = path.join(path.dirname(currentBundle), path.basename(appInDmg));
  updaterLog('info', `[mac] Installing to ${appDest}`);

  // ── 4. Copy with ditto (preserves macOS metadata) ─────────────────
  try {
    await execAsync(`ditto "${appInDmg}" "${appDest}"`);
    updaterLog('info', '[mac] ditto copy done');
  } catch (err) {
    await execAsync(`hdiutil detach "${mountPoint}" -quiet -force`).catch(() => {});
    try { fs.unlinkSync(tmpDmg); } catch {}
    throw new Error(`Copy failed: ${err.message}`);
  }

  // ── 5. Strip quarantine (just in case) ────────────────────────────
  await execAsync(`xattr -rd com.apple.quarantine "${appDest}"`).catch(() => {});

  // ── 6. Unmount + cleanup ───────────────────────────────────────────
  await execAsync(`hdiutil detach "${mountPoint}" -quiet -force`).catch(() => {});
  try { fs.unlinkSync(tmpDmg); } catch {}

  updaterLog('info', `[mac] Update ${version} installed — prompting restart`);

  if (win && !win.isDestroyed()) { win.setProgressBar(-1); win.setTitle('Personal OS'); }

  // ── 7. Restart dialog ─────────────────────────────────────────────
  const restartOpts = {
    type: 'info',
    title: 'Update Installed',
    message: `Personal OS ${version} is ready`,
    detail: 'Restart now to launch the new version.',
    buttons: ['Restart Now', 'Later'],
    defaultId: 0,
    cancelId: 1,
  };
  const choice = win
    ? dialog.showMessageBoxSync(win, restartOpts)
    : dialog.showMessageBoxSync(restartOpts);

  updaterLog('info', `[mac] Restart choice: ${choice === 0 ? 'Now' : 'Later'}`);
  if (choice === 0) { app.relaunch(); app.quit(); }
}

async function checkForUpdatesMac() {
  updaterLog('info', `[mac] Checking GitHub releases (current: ${app.getVersion()})`);
  try {
    const res = await fetch(
      'https://api.github.com/repos/Jeevanrajss/North-OS/releases/latest',
      { headers: { 'User-Agent': 'PersonalOS-Updater' }, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) { updaterLog('error', `[mac] GitHub API ${res.status}`); return; }

    const release = await res.json();
    const latest  = (release.tag_name ?? '').replace(/^v/, '');
    const current = app.getVersion();
    updaterLog('info', `[mac] latest=${latest} current=${current}`);

    if (!latest || !semverGt(latest, current)) { updaterLog('info', '[mac] Already up to date'); return; }

    updaterLog('info', `[mac] Update available: ${latest}`);

    const arch   = process.arch;
    const assets = release.assets ?? [];
    const dmg    = assets.find((a) => a.name.endsWith('.dmg') && a.name.includes(arch))
                ?? assets.find((a) => a.name.endsWith('.dmg'));

    if (!dmg) { updaterLog('error', '[mac] No DMG asset found'); return; }

    const rawNotes = typeof release.body === 'string'
      ? release.body.replace(/<[^>]+>/g, '').trim().slice(0, 500) : '';

    const win   = getActiveWindow();
    const opts  = {
      type: 'info', title: 'Update Available',
      message: `Personal OS ${latest} is available`,
      detail: [
        `You have ${current}.`,
        rawNotes ? `\nWhat's new:\n${rawNotes}` : '',
        '\nClick "Install Now" — the app will download, install and restart automatically.',
      ].filter(Boolean).join(''),
      buttons: ['Install Now', 'Later'],
      defaultId: 0, cancelId: 1,
    };

    const choice = win ? dialog.showMessageBoxSync(win, opts) : dialog.showMessageBoxSync(opts);
    updaterLog('info', `[mac] Dialog choice: ${choice === 0 ? 'Install Now' : 'Later'}`);

    if (choice === 0) {
      installMacUpdate(dmg.browser_download_url, latest).catch((err) => {
        updaterLog('error', `[mac] installMacUpdate error: ${err.message}`);
        const w = getActiveWindow();
        const errOpts = { type: 'error', title: 'Update Failed',
          message: `Could not install update: ${err.message}`, buttons: ['OK'] };
        if (w) dialog.showMessageBox(w, errOpts).catch(() => {});
        else   dialog.showMessageBox(errOpts).catch(() => {});
      });
    }
  } catch (err) {
    updaterLog('error', `[mac] checkForUpdatesMac error: ${err?.message ?? err}`);
  }
}

// ── Windows updater (electron-updater / Squirrel.Windows) ────────────────────

autoUpdater.logger = {
  info:  (m) => updaterLog('info',  typeof m === 'object' ? JSON.stringify(m) : m),
  warn:  (m) => updaterLog('warn',  typeof m === 'object' ? JSON.stringify(m) : m),
  error: (m) => updaterLog('error', typeof m === 'object' ? JSON.stringify(m) : m),
  debug: (m) => updaterLog('debug', typeof m === 'object' ? JSON.stringify(m) : m),
};

autoUpdater.on('update-available', (info) => {
  updaterLog('info', `[win] Update available: ${info.version} — downloading…`);
  const win = getActiveWindow();
  const dlg = win
    ? dialog.showMessageBox(win, { type: 'info', title: 'Update Available',
        message: `Personal OS ${info.version} is available`,
        detail: `Downloading in the background — you'll be notified when it's ready.`,
        buttons: ['OK'] })
    : dialog.showMessageBox({ type: 'info', title: 'Update Available',
        message: `Personal OS ${info.version} is available`,
        detail: `Downloading in the background — you'll be notified when it's ready.`,
        buttons: ['OK'] });
  dlg.catch(() => {});
});

autoUpdater.on('update-not-available', (info) => {
  updaterLog('info', `[win] Already up to date (latest: ${info.version})`);
});

autoUpdater.on('download-progress', (progress) => {
  const pct = Math.round(progress.percent);
  updaterLog('info', `[win] Downloading… ${pct}%`);
  const win = getActiveWindow();
  if (win) {
    win.setProgressBar(progress.percent / 100);
    win.setTitle(`Personal OS — Downloading update ${pct}%`);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  updaterLog('info', `[win] Download complete: ${info.version}`);
  const win = getActiveWindow();
  if (win && !win.isDestroyed()) { win.setProgressBar(-1); win.setTitle('Personal OS'); }

  const dlOpts = {
    type: 'info', title: 'Update Ready to Install',
    message: `Personal OS ${info.version} downloaded`,
    detail: 'Restart now to apply the update.',
    buttons: ['Restart Now', 'Later'], defaultId: 0, cancelId: 1,
  };
  try {
    const win2  = getActiveWindow();
    const choice = win2 ? dialog.showMessageBoxSync(win2, dlOpts) : dialog.showMessageBoxSync(dlOpts);
    updaterLog('info', `[win] Restart choice: ${choice === 0 ? 'Now' : 'Later'}`);
    if (choice === 0) autoUpdater.quitAndInstall();
  } catch (e) {
    updaterLog('error', `[win] Restart dialog error: ${e?.message}`);
    autoUpdater.quitAndInstall();
  }
});

autoUpdater.on('error', (err) => {
  updaterLog('error', `[win] autoUpdater error: ${err?.message ?? err}`);
});

// ── checkForUpdates — routes by platform ─────────────────────────────────────

function checkForUpdates() {
  if (IS_DEV) { updaterLog('info', 'Dev mode — skipping'); return; }
  if (IS_MAC) {
    checkForUpdatesMac();          // GitHub API — no Squirrel, no signature check
  } else {
    updaterLog('info', `[win] Checking for updates (current: ${app.getVersion()})`);
    autoUpdater.checkForUpdates().catch((err) => {
      updaterLog('error', `[win] checkForUpdates threw: ${err?.message ?? err}`);
    });
  }
}

// IPC: allow the Settings page to trigger a manual update check
ipcMain.handle('check-for-updates', () => {
  updaterLog('info', 'Manual update check requested from renderer');
  checkForUpdates();
  return { ok: true, logPath: _logPath ?? path.join(app.getPath('userData'), 'updater.log') };
});

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.setName('Personal OS');

app.whenReady().then(async () => {
  // Get stable machine fingerprint
  try {
    machineId = machineIdSync(true); // hashed = true
  } catch {
    machineId = require('crypto')
      .createHash('sha256')
      .update(require('os').hostname())
      .digest('hex');
  }

  // 1. Start backend
  try {
    await startBackend();
  } catch (err) {
    dialog.showErrorBox('Startup Error', `Failed to start backend:\n${err.message}`);
    app.quit();
    return;
  }

  // 2. Check license
  const licensed = await checkLicense();

  if (!licensed) {
    createActivationWindow();
  } else {
    createMainWindow();
    checkForUpdates();
  }

  app.on('activate', () => {
    // macOS: re-create window when clicking dock icon with no windows open
    if (BrowserWindow.getAllWindows().length === 0) {
      if (readActivation()) createMainWindow();
      else createActivationWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (!IS_MAC) app.quit();
});

app.on('will-quit', () => {
  stopBackend();
});

app.on('before-quit', () => {
  stopBackend();
});
