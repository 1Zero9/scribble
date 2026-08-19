import type { Item } from '@/types/domain';
import { htmlToText } from '@/services/security/sanitise';

/** The plain text of an item, used by search, the organiser and Markdown export. */
export function itemText(item: Item): string {
  switch (item.content.kind) {
    case 'text':
      return htmlToText(item.content.html);
    case 'checklist':
      return [
        item.content.title,
        ...item.content.entries.map((entry) => `${entry.done ? '[x]' : '[ ]'} ${entry.text}`),
      ]
        .filter((line) => line.trim() !== '')
        .join('\n');
    case 'link':
      return [item.content.title, item.content.url, item.content.note]
        .filter((line) => line.trim() !== '')
        .join('\n');
    case 'image':
      return item.content.alt;
    case 'file':
      return [item.content.fileName, item.content.note].filter(Boolean).join('\n');
  }
}

/** A one-line preview for lists in the Drawer and search results. */
export function itemPreview(item: Item, maxLength = 120): string {
  const text = itemText(item).replace(/\s+/g, ' ').trim();
  if (text === '') return 'Empty note';
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}
