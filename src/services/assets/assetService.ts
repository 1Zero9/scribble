import { isDesktop } from '@/services/platform';
import { newId } from '@/lib/ids';
import {
  imageExtensionFor,
  isSafeRelativePath,
  validateDroppedImage,
} from '@/services/security/validation';
import { createLogger } from '@/services/logging/logger';

const log = createLogger('assets');

/** Sub-folder of the application-data directory that holds copied images. */
export const ASSETS_DIR = 'assets';

export interface StoredAsset {
  /** Relative path inside the assets folder, or a `data:` URL in browser mode. */
  source: string;
  mode: 'copy' | 'reference';
  mimeType: string;
  byteSize: number;
}

export interface AssetService {
  /** Copies image bytes into Scribble's own storage. Nothing is transmitted. */
  storeImage(bytes: Uint8Array, mimeType: string, suggestedName?: string): Promise<StoredAsset>;
  /** Returns a value usable as an `<img src>` for an already-stored asset. */
  resolveDisplayUrl(source: string): Promise<string>;
  /** Reads an asset back, for export. */
  read(source: string): Promise<Uint8Array>;
  /** Removes a stored asset. */
  remove(source: string): Promise<void>;
}

function assertValidImage(mimeType: string, byteSize: number): void {
  const result = validateDroppedImage(mimeType, byteSize);
  if (!result.ok) throw new Error(result.reason ?? 'That image cannot be added.');
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * Desktop implementation: images are copied into
 * `%APPDATA%\uk.scribble.app\assets` using a generated, path-safe file name.
 * The original file is never modified and never leaves the machine.
 */
function createDesktopAssetService(): AssetService {
  return {
    async storeImage(bytes, mimeType) {
      assertValidImage(mimeType, bytes.byteLength);
      const { mkdir, writeFile, exists, BaseDirectory } = await import('@tauri-apps/plugin-fs');

      if (!(await exists(ASSETS_DIR, { baseDir: BaseDirectory.AppData }))) {
        await mkdir(ASSETS_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
      }

      const relativePath = `${ASSETS_DIR}/${newId()}.${imageExtensionFor(mimeType)}`;
      if (!isSafeRelativePath(relativePath)) throw new Error('Could not build a safe file name.');

      await writeFile(relativePath, bytes, { baseDir: BaseDirectory.AppData });
      log.info('asset.stored', { bytes: bytes.byteLength });
      return { source: relativePath, mode: 'copy', mimeType, byteSize: bytes.byteLength };
    },

    async resolveDisplayUrl(source) {
      if (source.startsWith('data:')) return source;
      if (!isSafeRelativePath(source)) throw new Error('That asset path is not allowed.');
      const { convertFileSrc } = await import('@tauri-apps/api/core');
      const { appDataDir, join } = await import('@tauri-apps/api/path');
      return convertFileSrc(await join(await appDataDir(), source));
    },

    async read(source) {
      if (source.startsWith('data:')) return dataUrlToBytes(source);
      if (!isSafeRelativePath(source)) throw new Error('That asset path is not allowed.');
      const { readFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      return readFile(source, { baseDir: BaseDirectory.AppData });
    },

    async remove(source) {
      if (source.startsWith('data:') || !isSafeRelativePath(source)) return;
      const { remove, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      await remove(source, { baseDir: BaseDirectory.AppData });
    },
  };
}

/** Browser fallback: images are inlined as data URLs inside the local database. */
function createWebAssetService(): AssetService {
  return {
    async storeImage(bytes, mimeType) {
      assertValidImage(mimeType, bytes.byteLength);
      return {
        source: bytesToDataUrl(bytes, mimeType),
        mode: 'copy',
        mimeType,
        byteSize: bytes.byteLength,
      };
    },
    async resolveDisplayUrl(source) {
      return source;
    },
    async read(source) {
      if (!source.startsWith('data:')) throw new Error('That asset is not available here.');
      return dataUrlToBytes(source);
    },
    async remove() {
      // Data URLs live inside the item row and disappear with it.
    },
  };
}

let cached: AssetService | null = null;

export function assetService(): AssetService {
  cached ??= isDesktop() ? createDesktopAssetService() : createWebAssetService();
  return cached;
}
