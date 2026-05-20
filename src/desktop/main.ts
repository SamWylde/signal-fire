import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { BrowserWindow, Menu, app, screen, shell } from 'electron';

import { type UiServerHandle, startUiServer } from '../ui/server.js';

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
    console.warn('[signal-fire] window-state.json is malformed, ignoring');
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
      mainWindow = createWindow(uiServer.url);
    } else {
      pendingFocus = true;
    }
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function showWindow(window: BrowserWindow): void {
  if (window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
  window.focus();
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

function createWindow(url: string): BrowserWindow {
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

  window.on('resize', () => saveWindowState(window));
  window.on('move', () => saveWindowState(window));
  window.on('maximize', () => saveWindowState(window));
  window.on('unmaximize', () => saveWindowState(window));
  window.on('enter-full-screen', () => saveWindowState(window));
  window.on('leave-full-screen', () => saveWindowState(window));
  window.on('close', () => saveWindowStateSync(window));

  window.once('ready-to-show', () => showWindow(window));

  window.webContents.once('did-finish-load', () => showWindow(window));
  window.webContents.once('did-fail-load', () => showWindow(window));

  const showFallback = setTimeout(() => showWindow(window), 2500);
  showFallback.unref();
  window.once('closed', () => clearTimeout(showFallback));

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

  void window.loadURL(url);
  return window;
}

async function startDesktop(): Promise<void> {
  Menu.setApplicationMenu(null);
  app.setAppUserModelId('com.signal-fire.desktop');
  app.setName('Signal Fire');
  uiServer = await startUiServer({ host: '127.0.0.1', port: 4317 });
  mainWindow = createWindow(uiServer.url);
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
      console.error(message);
      app.quit();
    });
}

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && uiServer !== null) {
    mainWindow = createWindow(uiServer.url);
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
      console.error(message);
    })
    .finally(() => app.quit());
});
