import type { InkStroke, Item, Pad } from '@/types/domain';
import { itemText } from '@/lib/itemText';
import { formatDateTime } from '@/lib/time';
import { padDisplayName } from '@/services/search/search';

/**
 * Markdown rendering for exports.
 *
 * The date and clock shown in the top bar are ambient context only and are
 * deliberately never included. The export timestamp below refers to the export
 * itself, not to the pad's contents.
 */

function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}[\]()#+\-!])/g, '\\$1');
}

function renderItem(item: Item): string {
  const heading = `### ${escapeMarkdown(padItemTitle(item))}`;
  const meta = `*Created ${formatDateTime(item.createdAt)} · Updated ${formatDateTime(item.updatedAt)}*`;

  switch (item.content.kind) {
    case 'checklist': {
      const lines = item.content.entries.map(
        (entry) => `- [${entry.done ? 'x' : ' '}] ${escapeMarkdown(entry.text)}`,
      );
      return [heading, meta, '', ...lines].join('\n');
    }
    case 'link':
      return [heading, meta, '', `<${item.content.url}>`, item.content.note].join('\n').trim();
    case 'image':
      return [
        heading,
        meta,
        '',
        `![${escapeMarkdown(item.content.alt || 'Image')}](assets/${item.content.source.split('/').pop() ?? ''})`,
      ].join('\n');
    case 'file':
      return [
        heading,
        meta,
        '',
        `File reference (the original file was not copied): \`${item.content.fileName}\``,
        item.content.note,
      ]
        .join('\n')
        .trim();
    case 'text':
    default:
      return [heading, meta, '', itemText(item)].join('\n').trim();
  }
}

function padItemTitle(item: Item): string {
  if (item.content.kind === 'checklist' && item.content.title.trim() !== '') {
    return item.content.title;
  }
  if (item.content.kind === 'link') return item.content.title || item.content.url;
  if (item.content.kind === 'file') return item.content.fileName;
  const firstLine = itemText(item).split('\n')[0]?.trim() ?? '';
  if (firstLine === '') return 'Untitled note';
  return firstLine.length > 60 ? `${firstLine.slice(0, 59)}…` : firstLine;
}

export function padToMarkdown(
  pad: Pad,
  items: readonly Item[],
  ink: readonly InkStroke[],
  exportedAt: string,
): string {
  const live = items
    .filter((item) => item.padId === pad.id && item.deletedAt === null)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const lines: string[] = [
    `# ${escapeMarkdown(padDisplayName(pad))}`,
    '',
    `*Exported from Scribble on ${formatDateTime(exportedAt)}.*`,
    '',
  ];

  if (live.length === 0) {
    lines.push('_This pad has no notes._', '');
  } else {
    for (const item of live) {
      lines.push(renderItem(item), '');
    }
  }

  const strokes = ink.filter((stroke) => stroke.padId === pad.id && stroke.deletedAt === null);
  if (strokes.length > 0) {
    lines.push(
      '---',
      '',
      `_This pad also contains ${strokes.length} pen ${strokes.length === 1 ? 'stroke' : 'strokes'}. ` +
        'Ink is preserved as vector data in `data/scribble.json` and is not rendered in Markdown._',
      '',
    );
  }

  return lines.join('\n');
}

/** A path-safe file name for a pad's Markdown document inside the bundle. */
export function padMarkdownFileName(pad: Pad): string {
  const base = padDisplayName(pad)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `markdown/${base === '' ? 'pad' : base}-${pad.id.slice(0, 8)}.md`;
}
