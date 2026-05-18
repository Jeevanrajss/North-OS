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
        APP_ENV:                'production',
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

// ── Auto-updater logging ──────────────────────────────────────────────────────

let _logPath = null;
function updaterLog(level, msg) {
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${msg}\n`;
  console.log('[updater]', msg);
  try {
    if (!_logPath) _logPath = path.join(app.getPath('userData'), 'updater.log');
    // Keep log under 200 KB — truncate if larger
    try {
      const stat = fs.statSync(_logPath);
      if (stat.size > 200_000) fs.writeFileSync(_logPath, line, 'utf8');
      else fs.appendFileSync(_logPath, line, 'utf8');
    } catch {
      fs.writeFileSync(_logPath, line, 'utf8');
    }
  } catch { /* never crash because of logging */ }
}

// Unsigned build — skip both JS-level and Squirrel-level signature checks
autoUpdater.verifyUpdateCodeSignature = () => Promise.resolve(null);

// Wire electron-updater's internal logger to our file
autoUpdater.logger = {
  info:  (m) => updaterLog('info',  typeof m === 'object' ? JSON.stringify(m) : m),
  warn:  (m) => updaterLog('warn',  typeof m === 'object' ? JSON.stringify(m) : m),
  error: (m) => updaterLog('error', typeof m === 'object' ? JSON.stringify(m) : m),
  debug: (m) => updaterLog('debug', typeof m === 'object' ? JSON.stringify(m) : m),
};

// ── Auto-updater ──────────────────────────────────────────────────────────────

function getActiveWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  return BrowserWindow.getFocusedWindow()
    ?? BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
    ?? null;
}

function checkForUpdates() {
  if (IS_DEV) {
    updaterLog('info', 'Dev mode — skipping update check');
    return;
  }
  updaterLog('info', `Checking for updates (current: ${app.getVersion()})`);
  autoUpdater.checkForUpdates().catch((err) => {
    updaterLog('error', `checkForUpdates() threw: ${err?.message ?? err}`);
    // Show visible error so we know it failed
    const win = getActiveWindow();
    const msg = `Update check failed:\n${err?.message ?? err}\n\nCheck ${path.join(app.getPath('userData'), 'updater.log')} for details.`;
    if (win) dialog.showMessageBox(win, { type: 'error', title: 'Update Check Failed', message: msg, buttons: ['OK'] }).catch(() => {});
    else dialog.showMessageBox({ type: 'error', title: 'Update Check Failed', message: msg, buttons: ['OK'] }).catch(() => {});
  });
}

autoUpdater.on('checking-for-update', () => {
  updaterLog('info', 'Contacting GitHub releases…');
});

autoUpdater.on('update-available', (info) => {
  updaterLog('info', `Update available: ${info.version}`);

  const rawNotes = typeof info.releaseNotes === 'string'
    ? info.releaseNotes
    : Array.isArray(info.releaseNotes)
      ? info.releaseNotes.map((r) => r.note || '').join('\n')
      : '';
  const notes = rawNotes.replace(/<[^>]+>/g, '').trim();

  const detail = [
    `Version ${info.version} is available (you have ${app.getVersion()}).`,
    notes ? `\nWhat's new:\n${notes}` : '',
    '\nDownloading in the background — you\'ll be notified when it\'s ready to install.',
  ].filter(Boolean).join('');

  const win = getActiveWindow();
  const msgOpts = {
    type: 'info',
    title: 'Update Available',
    message: `Personal OS ${info.version} is available`,
    detail,
    buttons: ['OK'],
  };
  const dlg = win
    ? dialog.showMessageBox(win, msgOpts)
    : dialog.showMessageBox(msgOpts);
  dlg.catch((e) => updaterLog('error', `update-available dialog error: ${e?.message}`));
});

autoUpdater.on('update-not-available', (info) => {
  updaterLog('info', `Already up to date (latest: ${info.version})`);
});

autoUpdater.on('download-progress', (progress) => {
  const pct = Math.round(progress.percent);
  updaterLog('info', `Downloading… ${pct}% (${Math.round(progress.bytesPerSecond / 1024)} KB/s)`);
  const win = getActiveWindow();
  if (win) {
    win.setProgressBar(progress.percent / 100);
    win.setTitle(`Personal OS — Downloading update ${pct}%`);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  updaterLog('info', `Download complete: ${info.version} — showing restart dialog`);

  const win = getActiveWindow();
  if (win && !win.isDestroyed()) {
    win.setProgressBar(-1);
    win.setTitle('Personal OS');
  }

  const rawNotes = typeof info.releaseNotes === 'string'
    ? info.releaseNotes
    : Array.isArray(info.releaseNotes)
      ? info.releaseNotes.map((r) => r.note || '').join('\n')
      : '';
  const notes = rawNotes.replace(/<[^>]+>/g, '').trim();

  const detail = [
    notes ? `What's new in ${info.version}:\n${notes}` : `Version ${info.version} is ready.`,
    '',
    'Restart now to apply the update.',
  ].filter(Boolean).join('\n');

  const dlOpts = {
    type: 'info',
    title: 'Update Ready to Install',
    message: `Personal OS ${info.version} downloaded`,
    detail,
    buttons: ['Restart Now', 'Later'],
    defaultId: 0,
    cancelId: 1,
  };

  try {
    const win2 = getActiveWindow();
    const choice = win2
      ? dialog.showMessageBoxSync(win2, dlOpts)
      : dialog.showMessageBoxSync(dlOpts);
    updaterLog('info', `Restart dialog choice: ${choice === 0 ? 'Restart Now' : 'Later'}`);
    if (choice === 0) autoUpdater.quitAndInstall();
  } catch (e) {
    updaterLog('error', `update-downloaded dialog error: ${e?.message}`);
    // Last resort: just install silently
    autoUpdater.quitAndInstall();
  }
});

autoUpdater.on('error', (err) => {
  updaterLog('error', `autoUpdater error: ${err?.message ?? err}\n${err?.stack ?? ''}`);
  // Show a visible dialog so the user knows something went wrong
  const win = getActiveWindow();
  const logHint = `\n\nLog: ${path.join(app.getPath('userData'), 'updater.log')}`;
  const msg = `Auto-update encountered an error:\n${err?.message ?? err}${logHint}`;
  try {
    if (win) dialog.showMessageBox(win, { type: 'warning', title: 'Update Error', message: msg, buttons: ['OK'] }).catch(() => {});
    else dialog.showMessageBox({ type: 'warning', title: 'Update Error', message: msg, buttons: ['OK'] }).catch(() => {});
  } catch { /* ignore dialog errors */ }
});

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
