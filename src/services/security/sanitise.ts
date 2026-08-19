/**
 * HTML sanitisation for note rich text.
 *
 * Scribble stores note bodies as small fragments of HTML produced by a
 * `contenteditable` region. That content can also arrive from a paste or an
 * import, so it is untrusted and must be reduced to a strict allowlist before it
 * is stored or rendered.
 *
 * The implementation is deliberately small and dependency-free so it can be
 * audited in one sitting. It parses with `DOMParser`, which does not execute
 * scripts or load subresources, and rebuilds a clean tree.
 */

const ALLOWED_TAGS = new Set([
  'P',
  'BR',
  'DIV',
  'SPAN',
  'STRONG',
  'B',
  'EM',
  'I',
  'U',
  'S',
  'CODE',
  'H1',
  'H2',
  'H3',
  'UL',
  'OL',
  'LI',
  'BLOCKQUOTE',
  'A',
]);

/** Tags rewritten to their semantic equivalent. */
const TAG_ALIASES: Record<string, string> = { B: 'STRONG', I: 'EM' };

const ALLOWED_ATTRIBUTES: Record<string, readonly string[]> = {
  A: ['href', 'title'],
};

const SAFE_URL_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

/** Returns true when a URL is safe to store as a link target. */
export function isSafeHref(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return false;
  // Reject control characters used to smuggle `javascript:` past naive checks.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return false;
  try {
    const url = new URL(trimmed);
    return SAFE_URL_SCHEMES.has(url.protocol);
  } catch {
    return false;
  }
}

function sanitiseNode(node: Node, target: Node, doc: Document): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      target.appendChild(doc.createTextNode(child.nodeValue ?? ''));
      continue;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const element = child as Element;
    const tagName = element.tagName.toUpperCase();

    if (!ALLOWED_TAGS.has(tagName)) {
      // Drop the element but keep any allowed content inside it. Script, style
      // and similar elements have no useful children to keep.
      if (tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'TEMPLATE') continue;
      sanitiseNode(element, target, doc);
      continue;
    }

    const cleanName = TAG_ALIASES[tagName] ?? tagName;
    const clean = doc.createElement(cleanName);

    for (const attribute of ALLOWED_ATTRIBUTES[cleanName] ?? []) {
      const value = element.getAttribute(attribute);
      if (value === null) continue;
      if (attribute === 'href') {
        if (!isSafeHref(value)) continue;
        clean.setAttribute('href', value.trim());
        // Links open through the operating system handler, never in-app.
        clean.setAttribute('rel', 'noopener noreferrer');
      } else {
        clean.setAttribute(attribute, value.slice(0, 300));
      }
    }

    sanitiseNode(element, clean, doc);
    target.appendChild(clean);
  }
}

/** Maximum stored size for a single note body. */
export const MAX_RICH_TEXT_LENGTH = 100_000;

export function sanitiseHtml(input: string): string {
  if (input === '') return '';
  const truncated = input.slice(0, MAX_RICH_TEXT_LENGTH);
  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<body>${truncated}</body>`, 'text/html');
  const output = parsed.createElement('div');
  sanitiseNode(parsed.body, output, parsed);
  return output.innerHTML;
}

/** Converts arbitrary plain text into a safe HTML fragment. */
export function textToHtml(text: string): string {
  const escaped = text
    .slice(0, MAX_RICH_TEXT_LENGTH)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const paragraphs = escaped.split(/\r?\n\r?\n/);
  return paragraphs.map((paragraph) => `<p>${paragraph.replace(/\r?\n/g, '<br>')}</p>`).join('');
}

/** Reduces a stored HTML fragment to plain text, used by search and export. */
export function htmlToText(html: string): string {
  if (html === '') return '';
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');

  // Paragraph-level elements become a blank line so exported Markdown reads
  // correctly; list items and line breaks become a single newline.
  parsed.body
    .querySelectorAll('p, div, h1, h2, h3, blockquote')
    .forEach((block) => block.insertAdjacentText('afterend', '\n\n'));
  parsed.body
    .querySelectorAll('li, br')
    .forEach((block) => block.insertAdjacentText('afterend', '\n'));

  return (parsed.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}
