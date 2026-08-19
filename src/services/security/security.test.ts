import { describe, expect, it } from 'vitest';
import { htmlToText, isSafeHref, sanitiseHtml, textToHtml } from '@/services/security/sanitise';
import {
  extractUrl,
  fileExtension,
  formatBytes,
  isAllowedImageMimeType,
  isExecutableExtension,
  isSafeRelativePath,
  safeAssetFileName,
  validateDroppedImage,
  validateFileReference,
} from '@/services/security/validation';

describe('sanitiseHtml', () => {
  it('keeps the formatting Scribble supports', () => {
    const input =
      '<h2>Title</h2><p><strong>Bold</strong> and <em>italic</em></p><ul><li>One</li></ul>';
    expect(sanitiseHtml(input)).toBe(input);
  });

  it('normalises legacy tags', () => {
    expect(sanitiseHtml('<b>x</b><i>y</i>')).toBe('<strong>x</strong><em>y</em>');
  });

  it('removes script elements entirely', () => {
    expect(sanitiseHtml('<p>Safe</p><script>alert(1)</script>')).toBe('<p>Safe</p>');
  });

  it('removes event handler attributes', () => {
    expect(sanitiseHtml('<p onclick="steal()">Text</p>')).toBe('<p>Text</p>');
  });

  it('strips disallowed elements but keeps their readable content', () => {
    expect(sanitiseHtml('<marquee>Hello</marquee>')).toBe('Hello');
    expect(sanitiseHtml('<iframe src="https://example.com"></iframe>')).toBe('');
  });

  it('drops unsafe link schemes and keeps safe ones', () => {
    expect(sanitiseHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitiseHtml('<a href="https://example.com">x</a>')).toBe(
      '<a href="https://example.com" rel="noopener noreferrer">x</a>',
    );
  });

  it('rejects obfuscated javascript URLs', () => {
    expect(isSafeHref('java\u0000script:alert(1)')).toBe(false);
    expect(isSafeHref(' javascript:alert(1)')).toBe(false);
    expect(isSafeHref('data:text/html,<script>')).toBe(false);
    expect(isSafeHref('vbscript:msgbox')).toBe(false);
    expect(isSafeHref('mailto:someone@example.com')).toBe(true);
  });

  it('is idempotent', () => {
    const once = sanitiseHtml('<p><span style="x">a</span><img src=x onerror=y></p>');
    expect(sanitiseHtml(once)).toBe(once);
  });
});

describe('text conversion', () => {
  it('escapes text on the way in', () => {
    expect(textToHtml('<script>')).toBe('<p>&lt;script&gt;</p>');
  });

  it('preserves paragraphs and line breaks', () => {
    expect(textToHtml('a\nb\n\nc')).toBe('<p>a<br>b</p><p>c</p>');
  });

  it('reads text back out of stored HTML', () => {
    expect(htmlToText('<p>One</p><p>Two</p>')).toBe('One\n\nTwo');
  });
});

describe('file and image validation', () => {
  it('allows only raster image types, never SVG', () => {
    expect(isAllowedImageMimeType('image/png')).toBe(true);
    expect(isAllowedImageMimeType('image/svg+xml')).toBe(false);
  });

  it('rejects oversized and empty images', () => {
    expect(validateDroppedImage('image/png', 0).ok).toBe(false);
    expect(validateDroppedImage('image/png', 50 * 1024 * 1024).ok).toBe(false);
    expect(validateDroppedImage('image/png', 1024).ok).toBe(true);
  });

  it('refuses to reference executable files', () => {
    expect(isExecutableExtension('payload.exe')).toBe(true);
    expect(isExecutableExtension('script.PS1')).toBe(true);
    expect(isExecutableExtension('notes.pdf')).toBe(false);
    expect(validateFileReference('installer.msi', 100).ok).toBe(false);
    expect(validateFileReference('report.docx', 100).ok).toBe(true);
  });

  it('reads file extensions safely', () => {
    expect(fileExtension('a.tar.gz')).toBe('gz');
    expect(fileExtension('.hidden')).toBe('');
    expect(fileExtension('noextension')).toBe('');
  });
});

describe('path safety', () => {
  it('strips directory separators and traversal from asset names', () => {
    expect(safeAssetFileName('../../etc/passwd')).toBe('passwd');
    expect(safeAssetFileName('..\\..\\windows\\system32\\cmd')).toBe('cmd');
    expect(safeAssetFileName('a<b>c:d|e?f*.png')).toBe('abcdef.png');
  });

  it('replaces reserved Windows device names', () => {
    expect(safeAssetFileName('CON.txt')).toMatch(/^file-\d+$/);
  });

  it('rejects paths that escape the assets folder', () => {
    expect(isSafeRelativePath('assets/abc.png')).toBe(true);
    expect(isSafeRelativePath('assets/../secrets.db')).toBe(false);
    expect(isSafeRelativePath('/etc/passwd')).toBe(false);
    expect(isSafeRelativePath('C:/Windows/system32')).toBe(false);
    expect(isSafeRelativePath('assets\\abc.png')).toBe(false);
    expect(isSafeRelativePath('')).toBe(false);
  });
});

describe('URL extraction', () => {
  it('recognises a bare web address', () => {
    expect(extractUrl('  https://example.com/page  ')).toBe('https://example.com/page');
  });

  it('ignores prose and unsafe schemes', () => {
    expect(extractUrl('see https://example.com later')).toBeNull();
    expect(extractUrl('file:///C:/secret.txt')).toBeNull();
  });
});

describe('formatBytes', () => {
  it('produces readable sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(12 * 1024 * 1024)).toBe('12 MB');
  });
});
