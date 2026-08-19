import type { ItemContent, ItemType, Point } from '@/types/domain';
import { textToHtml } from '@/services/security/sanitise';
import {
  extractUrl,
  formatBytes,
  isAllowedImageMimeType,
  titleForUrl,
  validateDroppedImage,
  validateFileReference,
} from '@/services/security/validation';
import { assetService } from '@/services/assets/assetService';

/**
 * Turning dropped and pasted payloads into cards.
 *
 * Rules that hold for every path below:
 *  - Nothing is uploaded or transmitted.
 *  - Nothing is executed, previewed as active content, or fetched.
 *  - Images are copied into Scribble's own storage; other files are referenced
 *    by path only, and the card says so plainly.
 */

export interface CapturedContent {
  itemType: ItemType;
  content: ItemContent;
  width?: number;
  height?: number;
}

export interface CaptureOutcome {
  captured: CapturedContent[];
  /** Human-readable reasons for anything that was refused. */
  rejected: string[];
}

export async function captureFromImageBytes(
  bytes: Uint8Array,
  mimeType: string,
  altHint = '',
): Promise<CapturedContent> {
  const stored = await assetService().storeImage(bytes, mimeType);
  return {
    itemType: 'image',
    content: {
      kind: 'image',
      source: stored.source,
      mode: stored.mode,
      mimeType: stored.mimeType,
      alt: altHint,
      byteSize: stored.byteSize,
    },
    width: 320,
    height: 260,
  };
}

export function captureFromText(text: string): CapturedContent {
  const url = extractUrl(text);
  if (url !== null) {
    return {
      itemType: 'link',
      content: { kind: 'link', url, title: titleForUrl(url), note: '' },
      width: 300,
      height: 190,
    };
  }
  return { itemType: 'text', content: { kind: 'text', html: textToHtml(text) } };
}

export function captureFromFileReference(
  path: string,
  fileName: string,
  byteSize: number,
  mimeType: string,
): CapturedContent {
  return {
    itemType: 'file',
    content: {
      kind: 'file',
      path,
      fileName,
      mode: 'reference',
      mimeType,
      byteSize,
      note: '',
    },
    width: 280,
    height: 170,
  };
}

/** Handles a browser `DataTransfer` from a drop or a paste. */
export async function captureFromDataTransfer(data: DataTransfer): Promise<CaptureOutcome> {
  const captured: CapturedContent[] = [];
  const rejected: string[] = [];

  const files = Array.from(data.files ?? []);
  for (const file of files) {
    if (isAllowedImageMimeType(file.type)) {
      const validation = validateDroppedImage(file.type, file.size);
      if (!validation.ok) {
        rejected.push(validation.reason ?? `${file.name} could not be added.`);
        continue;
      }
      const buffer = await file.arrayBuffer();
      captured.push(await captureFromImageBytes(new Uint8Array(buffer), file.type, file.name));
      continue;
    }

    const validation = validateFileReference(file.name, file.size);
    if (!validation.ok) {
      rejected.push(validation.reason ?? `${file.name} could not be added.`);
      continue;
    }
    // A browser drop exposes no real path, so the card records the name only and
    // says clearly that it is a reference.
    captured.push(captureFromFileReference(file.name, file.name, file.size, file.type));
  }

  if (captured.length === 0) {
    const uriList = data.getData('text/uri-list');
    const plain = data.getData('text/plain');
    const text = uriList !== '' ? (uriList.split('\n')[0] ?? '') : plain;
    if (text.trim() !== '') captured.push(captureFromText(text));
  }

  return { captured, rejected };
}

/** Positions a set of captured cards in a gentle cascade from the drop point. */
export function cascade(origin: Point, index: number): Point {
  return { x: origin.x + index * 28, y: origin.y + index * 28 };
}

export { formatBytes };
