import { isDesktop } from '@/services/platform';
import { MAX_IMPORT_BYTES } from '@/services/security/validation';

/**
 * File save and open, kept behind one small interface so the rest of the
 * application never touches a platform API directly. On the desktop this uses
 * the operating system's own dialogs, which is the only way Scribble ever reads
 * or writes outside its own application-data folder.
 */

export async function saveBytes(fileName: string, bytes: Uint8Array): Promise<string | null> {
  if (isDesktop()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({
      defaultPath: fileName,
      filters: [{ name: 'Scribble export', extensions: ['zip'] }],
    });
    if (path === null) return null;
    await writeFile(path, bytes);
    return path;
  }

  // Browser development build: hand the bytes to the browser's own download flow.
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
  return fileName;
}

export async function openBytes(): Promise<{ name: string; bytes: Uint8Array } | null> {
  if (isDesktop()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { readFile } = await import('@tauri-apps/plugin-fs');
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Scribble export', extensions: ['zip'] }],
    });
    if (typeof selected !== 'string') return null;
    const bytes = await readFile(selected);
    if (bytes.byteLength > MAX_IMPORT_BYTES) throw new Error('That file is too large to import.');
    return { name: selected.split(/[\\/]/).pop() ?? 'export.zip', bytes };
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      if (file.size > MAX_IMPORT_BYTES) {
        reject(new Error('That file is too large to import.'));
        return;
      }
      file
        .arrayBuffer()
        .then((buffer) => resolve({ name: file.name, bytes: new Uint8Array(buffer) }))
        .catch(() => reject(new Error('That file could not be read.')));
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
