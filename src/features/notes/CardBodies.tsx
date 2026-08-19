import { useEffect, useState } from 'react';
import { ExternalLink, FileText, FolderOpen, Link as LinkIcon, TriangleAlert } from 'lucide-react';
import type { ItemContent } from '@/types/domain';
import { formatBytes } from '@/services/security/validation';
import { assetService } from '@/services/assets/assetService';
import { openExternally } from '@/services/desktop/windowService';
import { useUiStore } from '@/store/uiStore';
import { describeError } from '@/services/logging/logger';

type LinkContent = Extract<ItemContent, { kind: 'link' }>;
type ImageContent = Extract<ItemContent, { kind: 'image' }>;
type FileContent = Extract<ItemContent, { kind: 'file' }>;

/**
 * A link card.
 *
 * Scribble never fetches the page, renders a preview or embeds remote content:
 * doing so would make a network request on the user's behalf. The card shows the
 * address and opens it in the user's own browser when asked.
 */
export function LinkCardBody({
  content,
  onChange,
}: {
  content: LinkContent;
  onChange: (content: LinkContent) => void;
}) {
  const notify = useUiStore((state) => state.notify);
  let host = content.url;
  try {
    host = new URL(content.url).hostname;
  } catch {
    host = content.url;
  }

  return (
    <div className="flex h-full flex-col gap-2 overflow-auto text-sm">
      <div className="flex items-center gap-2">
        <LinkIcon size={14} aria-hidden="true" style={{ color: 'var(--sb-accent-strong)' }} />
        <span className="sb-chip">Link</span>
      </div>

      <input
        className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 font-medium hover:border-[var(--sb-border)] focus:border-[var(--sb-border)]"
        value={content.title}
        placeholder="Link title"
        aria-label="Link title"
        maxLength={300}
        onChange={(event) => onChange({ ...content, title: event.target.value })}
      />

      <p className="truncate text-xs" style={{ color: 'var(--sb-text-muted)' }} title={content.url}>
        {host}
      </p>

      <textarea
        className="min-h-[2.5rem] flex-1 resize-none rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-[var(--sb-border)] focus:border-[var(--sb-border)]"
        value={content.note}
        placeholder="Add a note about this link"
        aria-label="Note about this link"
        maxLength={4000}
        onChange={(event) => onChange({ ...content, note: event.target.value })}
      />

      <button
        type="button"
        className="sb-button self-start text-xs"
        onClick={() => {
          void openExternally(content.url).catch((error: unknown) =>
            notify(describeError(error, 'That link could not be opened.'), 'error'),
          );
        }}
      >
        <ExternalLink size={14} aria-hidden="true" />
        Open in browser
      </button>
    </div>
  );
}

/** An image card. Bytes are held in Scribble's own storage and never transmitted. */
export function ImageCardBody({
  content,
  onChange,
}: {
  content: ImageContent;
  onChange: (content: ImageContent) => void;
}) {
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    assetService()
      .resolveDisplayUrl(content.source)
      .then((url) => {
        if (active) setSource(url);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [content.source]);

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded">
        {failed ? (
          <p className="flex items-center gap-2 text-xs" style={{ color: 'var(--sb-danger)' }}>
            <TriangleAlert size={14} aria-hidden="true" />
            This image is no longer available.
          </p>
        ) : source !== null ? (
          <img
            src={source}
            alt={content.alt === '' ? 'Image added to this pad' : content.alt}
            className="max-h-full max-w-full object-contain"
            draggable={false}
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="text-xs" style={{ color: 'var(--sb-text-subtle)' }}>
            Loading image…
          </span>
        )}
      </div>

      <input
        className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-[var(--sb-border)] focus:border-[var(--sb-border)]"
        value={content.alt}
        placeholder="Describe this image (used by screen readers)"
        aria-label="Image description"
        maxLength={500}
        onChange={(event) => onChange({ ...content, alt: event.target.value })}
      />
      <p className="text-[11px]" style={{ color: 'var(--sb-text-subtle)' }}>
        Copy held by Scribble · {formatBytes(content.byteSize)}
      </p>
    </div>
  );
}

/**
 * A file-reference card.
 *
 * The wording and the badge make it unmistakable that Scribble stores only a
 * path: the file itself is untouched, is not copied, and is never opened or
 * executed by Scribble.
 */
export function FileCardBody({
  content,
  onChange,
}: {
  content: FileContent;
  onChange: (content: FileContent) => void;
}) {
  const notify = useUiStore((state) => state.notify);

  return (
    <div className="flex h-full flex-col gap-2 overflow-auto text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <FileText size={14} aria-hidden="true" style={{ color: 'var(--sb-text-muted)' }} />
        <span className="sb-chip">
          {content.mode === 'reference' ? 'File reference — not copied' : 'Copy held by Scribble'}
        </span>
      </div>

      <p className="truncate font-medium" title={content.fileName}>
        {content.fileName}
      </p>
      <p className="text-xs" style={{ color: 'var(--sb-text-muted)' }}>
        {content.byteSize > 0 ? formatBytes(content.byteSize) : 'Size unknown'}
        {content.mimeType !== '' ? ` · ${content.mimeType}` : ''}
      </p>

      <textarea
        className="min-h-[2.5rem] flex-1 resize-none rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-[var(--sb-border)] focus:border-[var(--sb-border)]"
        value={content.note}
        placeholder="Why does this file matter?"
        aria-label="Note about this file"
        maxLength={4000}
        onChange={(event) => onChange({ ...content, note: event.target.value })}
      />

      <button
        type="button"
        className="sb-button self-start text-xs"
        onClick={() => {
          void (async () => {
            try {
              const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
              await revealItemInDir(content.path);
            } catch {
              notify('Scribble could not show that file. It may have been moved.', 'warning');
            }
          })();
        }}
        title="Shows the file in File Explorer. Scribble never opens or runs the file itself."
      >
        <FolderOpen size={14} aria-hidden="true" />
        Show in folder
      </button>
    </div>
  );
}
