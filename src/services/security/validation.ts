/**
 * Validation rules for anything that enters Scribble from outside: dropped
 * files, pasted clipboard payloads and imported bundles.
 *
 * The guiding rules are:
 *  - Never execute or evaluate dropped content.
 *  - Never render untrusted remote content.
 *  - Keep all paths inside the Scribble application-data directory.
 */

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024; // 12 MB
export const MAX_FILE_REFERENCE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB, reference only
export const MAX_IMPORT_BYTES = 200 * 1024 * 1024; // 200 MB

/** Raster formats Scribble will decode and display. SVG is excluded: it can carry script. */
export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/avif',
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
};

/** Extensions Scribble refuses to reference, because they are directly executable. */
const EXECUTABLE_EXTENSIONS = new Set([
  'exe',
  'com',
  'scr',
  'pif',
  'bat',
  'cmd',
  'ps1',
  'psm1',
  'vbs',
  'vbe',
  'js',
  'jse',
  'wsf',
  'wsh',
  'msi',
  'msp',
  'hta',
  'cpl',
  'dll',
  'jar',
  'reg',
  'lnk',
  'scf',
  'inf',
  'sys',
]);

export function isAllowedImageMimeType(mime: string): mime is AllowedImageMimeType {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mime.toLowerCase());
}

export function imageExtensionFor(mime: string): string {
  return IMAGE_EXTENSIONS[mime.toLowerCase()] ?? 'bin';
}

export function fileExtension(name: string): string {
  const index = name.lastIndexOf('.');
  if (index <= 0 || index === name.length - 1) return '';
  return name.slice(index + 1).toLowerCase();
}

export function isExecutableExtension(name: string): boolean {
  return EXECUTABLE_EXTENSIONS.has(fileExtension(name));
}

export interface ValidationResult {
  ok: boolean;
  /** User-facing, plain-language reason. Shown directly in the interface. */
  reason?: string;
}

export function validateDroppedImage(mimeType: string, byteSize: number): ValidationResult {
  if (!isAllowedImageMimeType(mimeType)) {
    return { ok: false, reason: `Scribble cannot display ${mimeType || 'that image type'}.` };
  }
  if (byteSize <= 0) return { ok: false, reason: 'That image appears to be empty.' };
  if (byteSize > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      reason: `Images must be smaller than ${formatBytes(MAX_IMAGE_BYTES)}.`,
    };
  }
  return { ok: true };
}

export function validateFileReference(name: string, byteSize: number): ValidationResult {
  if (name.trim() === '') return { ok: false, reason: 'That file has no name.' };
  if (isExecutableExtension(name)) {
    return {
      ok: false,
      reason: 'Scribble does not keep references to executable files.',
    };
  }
  if (byteSize > MAX_FILE_REFERENCE_BYTES) {
    return { ok: false, reason: 'That file is too large to reference.' };
  }
  return { ok: true };
}

/**
 * Produces a safe file name for use inside the Scribble assets directory.
 * Directory separators, traversal sequences, reserved Windows device names and
 * control characters are all removed.
 */
export function safeAssetFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"|?*]/g, '')
    .replace(/\.\.+/g, '.')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120);

  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;
  if (cleaned === '' || reserved.test(cleaned)) return `file-${Date.now()}`;
  return cleaned;
}

/**
 * Guards against path traversal for any path Scribble builds itself.
 * Only simple, relative, forward-slash paths are accepted.
 */
export function isSafeRelativePath(path: string): boolean {
  if (path === '' || path.length > 400) return false;
  if (path.includes('\\')) return false;
  if (path.startsWith('/')) return false;
  if (/^[a-z]:/i.test(path)) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(path)) return false;
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

/** Extracts the first URL from a dropped or pasted text payload. */
export function extractUrl(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length > 2048 || trimmed.includes('\n')) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
    return null;
  } catch {
    return null;
  }
}

/** A short, human-readable title for a URL, used on link cards. */
export function titleForUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, '');
    const last = path.split('/').filter(Boolean).pop();
    return last ? `${parsed.hostname} — ${decodeURIComponent(last)}` : parsed.hostname;
  } catch {
    return url;
  }
}
