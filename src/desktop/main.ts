import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { BrowserWindow, Menu, app, screen, shell } from 'electron';

import { createLogger } from '../core/logging.js';
import { type UiServerHandle, startUiServer } from '../ui/server.js';

const log = createLogger('desktop');

const SPLASH_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#eef2f4;display:flex;align-items:center;justify-content:center;
       height:100vh;font-family:system-ui,sans-serif;flex-direction:column;gap:24px}
  .wordmark{font-size:28px;font-weight:700;color:#1a1a1a;letter-spacing:-0.5px}
  .wordmark span{color:#e25c2a}
  .spinner{width:32px;height:32px;border:3px solid #d0d7da;
           border-top-color:#e25c2a;border-radius:50%;
           animation:spin 0.8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
</style></head>
<body><div class="wordmark">Signal <span>Fire</span></div>
<div class="spinner"></div></body></html>`;

const SPLASH_DATA_URL = `data:text/html;charset=utf-8,${encodeURIComponent(SPLASH_HTML)}`;

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized: boolean;
  isFullScreen: boolean;
}

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 860;

function getWindowStatePath(): string {
  const root = process.env.SIGNAL_FIRE_HOME ?? path.join(os.homedir(), '.signal-fire');
  return path.join(root, 'window-state.json');
}

function loadWindowState(): WindowState | null {
  const statePath = getWindowStatePath();
  let raw: string;
  try {
    raw = fsSync.readFileSync(statePath, 'utf8');
  } catch {
    return null;
  }
  let state: WindowState;
  try {
    state = JSON.parse(raw) as WindowState;
  } catch {
    log.warn('window-state.json is malformed, ignoring');
    return null;
  }
  // Validate x/y are within current display bounds; drop them if not
  if (state.x !== undefined && state.y !== undefined) {
    const sx = state.x;
    const sy = state.y;
    const displays = screen.getAllDisplays();
    const onScreen = displays.some(
      (d) =>
        sx >= d.bounds.x &&
        sy >= d.bounds.y &&
        sx < d.bounds.x + d.bounds.width &&
        sy < d.bounds.y + d.bounds.height,
    );
    if (!onScreen) {
      const { x: _x, y: _y, ...rest } = state;
      return rest;
    }
  }
  return state;
}

let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function saveWindowStateSync(window: BrowserWindow): void {
  if (saveDebounceTimer !== null) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }
  try {
    const isMaximized = window.isMaximized();
    const isFullScreen = window.isFullScreen();
    const bounds = isMaximized || isFullScreen ? window.getNormalBounds() : window.getBounds();
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized,
      isFullScreen,
    };
    const statePath = getWindowStatePath();
    const tmpPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
    fsSync.mkdirSync(path.dirname(statePath), { recursive: true });
    fsSync.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf8');
    fsSync.renameSync(tmpPath, statePath);
  } catch {
    // Swallow — non-critical; next launch falls back to defaults
  }
}

function saveWindowState(window: BrowserWindow): void {
  if (saveDebounceTimer !== null) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    saveDebounceTimer = null;
    if (window.isDestroyed()) return;
    const isMaximized = window.isMaximized();
    const isFullScreen = window.isFullScreen();
    const bounds = isMaximized || isFullScreen ? window.getNormalBounds() : window.getBounds();
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized,
      isFullScreen,
    };
    const statePath = getWindowStatePath();
    const tmpPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
    fs.mkdir(path.dirname(statePath), { recursive: true })
      .then(() => fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8'))
      .then(() => fs.rename(tmpPath, statePath))
      .catch(() => {
        // Swallow silently — don't crash the app on save failure
        fs.rm(tmpPath, { force: true }).catch(() => undefined);
      });
  }, 250);
}

let mainWindow: BrowserWindow | null = null;
let uiServer: UiServerHandle | null = null;
let closingServer = false;
let pendingFocus = false;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

function getIconPath(): string {
  return path.join(process.cwd(), 'assets', 'signal-fire.ico');
}

function focusMainWindow(): void {
  if (mainWindow === null) {
    if (uiServer !== null) {
      const w = createWindow();
      void w.loadURL(uiServer.url).catch((err) => {
        log.error('loadURL failed:', err);
      });
      mainWindow = w;
    } else {
      pendingFocus = true;
    }
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function isInternalUrl(rawUrl: string): boolean {
  if (uiServer === null) return false;

  try {
    return new URL(rawUrl).origin === new URL(uiServer.url).origin;
  } catch {
    return false;
  }
}

async function closeUiServer(): Promise<void> {
  const handle = uiServer;
  uiServer = null;
  if (handle !== null) await handle.close();
}

function createWindow(): BrowserWindow {
  const state = loadWindowState();
  const window = new BrowserWindow({
    width: state?.width ?? DEFAULT_WIDTH,
    height: state?.height ?? DEFAULT_HEIGHT,
    ...(state?.x !== undefined && state?.y !== undefined ? { x: state.x, y: state.y } : {}),
    minWidth: 1024,
    minHeight: 700,
    title: 'Signal Fire',
    icon: getIconPath(),
    backgroundColor: '#eef2f4',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  if (state?.isMaximized) window.maximize();
  if (state?.isFullScreen) window.setFullScreen(true);

  window.once('ready-to-show', () => {
    if (!window.isDestroyed()) window.show();
  });
  const showFallback = setTimeout(() => {
    if (!window.isDestroyed() && !window.isVisible()) window.show();
  }, 1500);
  window.once('ready-to-show', () => clearTimeout(showFallback));

  window.on('resize', () => saveWindowState(window));
  window.on('move', () => saveWindowState(window));
  window.on('maximize', () => saveWindowState(window));
  window.on('unmaximize', () => saveWindowState(window));
  window.on('enter-full-screen', () => saveWindowState(window));
  window.on('leave-full-screen', () => saveWindowState(window));
  window.on('close', () => saveWindowStateSync(window));

  window.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (isInternalUrl(targetUrl)) return { action: 'allow' };
    void shell.openExternal(targetUrl);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, targetUrl) => {
    if (isInternalUrl(targetUrl)) return;
    event.preventDefault();
    void shell.openExternal(targetUrl);
  });

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });

  void window.loadURL(SPLASH_DATA_URL).catch(() => {
    /* aborted when real URL loads */
  });
  return window;
}

async function startDesktop(): Promise<void> {
  Menu.setApplicationMenu(null);
  app.setAppUserModelId('com.signal-fire.desktop');
  app.setName('Signal Fire');

  mainWindow = createWindow();
  uiServer = await startUiServer({ host: '127.0.0.1', port: 4317 });
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  void mainWindow.loadURL(uiServer.url).catch((err) => {
    log.error('Failed to load UI server URL:', err);
  });

  if (pendingFocus) {
    pendingFocus = false;
    focusMainWindow();
  }
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', focusMainWindow);

  app
    .whenReady()
    .then(startDesktop)
    .catch((err: unknown) => {
      const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
      log.error(message);
      app.quit();
    });
}

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && uiServer !== null) {
    const w = createWindow();
    void w.loadURL(uiServer.url).catch((err) => {
      log.error('loadURL failed:', err);
    });
    mainWindow = w;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (event) => {
  if (mainWindow !== null && !mainWindow.isDestroyed()) saveWindowStateSync(mainWindow);
  if (uiServer === null || closingServer) return;

  event.preventDefault();
  closingServer = true;
  closeUiServer()
    .catch((err: unknown) => {
      const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
      log.error(message);
    })
    .finally(() => app.quit());
});
