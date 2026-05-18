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
      // No preload needed — the app is at http://localhost, uses its own API
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

// ── Auto-updater ──────────────────────────────────────────────────────────────

function checkForUpdates() {
  if (IS_DEV) return;
  autoUpdater.checkForUpdates();
}

autoUpdater.on('update-available', (info) => {
  console.log('[updater] Update available:', info.version);

  // Strip HTML tags from release notes (GitHub returns HTML)
  const rawNotes = typeof info.releaseNotes === 'string'
    ? info.releaseNotes
    : Array.isArray(info.releaseNotes)
      ? info.releaseNotes.map((r) => r.note || '').join('\n')
      : '';
  const notes = rawNotes.replace(/<[^>]+>/g, '').trim();

  const detail = [
    `Version ${info.version} is available (you have ${app.getVersion()}).`,
    '',
    notes ? `What's new:\n${notes}` : '',
    '',
    'Downloading in the background — you\'ll be notified when it\'s ready to install.',
  ].filter(Boolean).join('\n');

  const win = (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null)
    ?? BrowserWindow.getFocusedWindow()
    ?? BrowserWindow.getAllWindows()[0];
  const msgOpts = {
    type: 'info',
    title: 'Update Available',
    message: `Personal OS ${info.version} is available`,
    detail,
    buttons: ['OK'],
  };
  if (win) dialog.showMessageBox(win, msgOpts);
  else dialog.showMessageBox(msgOpts);
});

autoUpdater.on('update-not-available', () => {
  console.log('[updater] App is up to date');
});

autoUpdater.on('download-progress', (progress) => {
  const pct = Math.round(progress.percent);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setProgressBar(progress.percent / 100);
    mainWindow.setTitle(`Personal OS — Downloading update ${pct}%`);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  // Reset progress bar
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setProgressBar(-1);
    mainWindow.setTitle('Personal OS');
  }

  // Strip HTML from release notes
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

  const win2 = (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null)
    ?? BrowserWindow.getFocusedWindow()
    ?? BrowserWindow.getAllWindows()[0];
  const dlOpts = {
    type: 'info',
    title: 'Update Ready to Install',
    message: `Personal OS ${info.version} downloaded`,
    detail,
    buttons: ['Restart Now', 'Later'],
    defaultId: 0,
    cancelId: 1,
  };
  const choice = win2
    ? dialog.showMessageBoxSync(win2, dlOpts)
    : dialog.showMessageBoxSync(dlOpts);

  if (choice === 0) autoUpdater.quitAndInstall();
});

autoUpdater.on('error', (err) => {
  console.error('[updater] Error:', err.message);
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
