/**
 * Detects whether Scribble is running inside the Tauri desktop shell.
 *
 * The browser build is a development and testing convenience only; it uses
 * WebAssembly SQLite and cannot reach the file system, the tray or the global
 * shortcut. Every capability check in the application funnels through here so
 * behaviour differences stay explicit.
 */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export interface PlatformCapabilities {
  desktop: boolean;
  /** Copying dropped images into the protected application-data folder. */
  localAssets: boolean;
  trayAndShortcut: boolean;
  fileDialogs: boolean;
}

export function platformCapabilities(): PlatformCapabilities {
  const desktop = isDesktop();
  return {
    desktop,
    localAssets: desktop,
    trayAndShortcut: desktop,
    fileDialogs: desktop,
  };
}
