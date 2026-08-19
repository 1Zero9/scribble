import { isDesktop } from '@/services/platform';
import { createLogger } from '@/services/logging/logger';

const log = createLogger('window');

/**
 * Window, tray and global-shortcut integration.
 *
 * All of this is a no-op in the browser development build, so the interface can
 * be exercised without a Rust toolchain.
 */

export async function hideWindow(): Promise<void> {
  if (!isDesktop()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().hide();
  log.info('window.hidden');
}

export async function showWindow(): Promise<void> {
  if (!isDesktop()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const window = getCurrentWindow();
  await window.show();
  await window.setFocus();
  log.info('window.shown');
}

export async function toggleWindow(): Promise<void> {
  if (!isDesktop()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const window = getCurrentWindow();
  if (await window.isVisible()) {
    await window.hide();
  } else {
    await window.show();
    await window.setFocus();
  }
}

/**
 * Registers the summon shortcut. Returns a function that unregisters it, so a
 * changed shortcut never leaves the previous one active.
 */
export async function registerSummonShortcut(accelerator: string): Promise<() => Promise<void>> {
  if (!isDesktop()) return async () => undefined;

  const { register, unregister, isRegistered } = await import('@tauri-apps/plugin-global-shortcut');
  try {
    if (await isRegistered(accelerator)) await unregister(accelerator);
    await register(accelerator, (event) => {
      if (event.state === 'Pressed') void toggleWindow();
    });
    log.info('shortcut.registered');
  } catch {
    log.warn('shortcut.registration.failed');
    return async () => undefined;
  }

  return async () => {
    try {
      await unregister(accelerator);
    } catch {
      log.warn('shortcut.unregister.failed');
    }
  };
}

/** Converts the stored accelerator into something readable for the interface. */
export function describeAccelerator(accelerator: string): string {
  return accelerator
    .split('+')
    .map((part) => (part === 'CmdOrControl' ? 'Ctrl' : part))
    .join(' + ');
}

/** Opens a link with the operating system's default handler, never in-app. */
export async function openExternally(url: string): Promise<void> {
  if (!isDesktop()) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  const { openUrl } = await import('@tauri-apps/plugin-opener');
  await openUrl(url);
}
