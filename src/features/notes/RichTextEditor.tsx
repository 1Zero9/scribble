import { useEffect, useRef } from 'react';
import { sanitiseHtml } from '@/services/security/sanitise';

interface RichTextEditorProps {
  html: string;
  editing: boolean;
  placeholder: string;
  ariaLabel: string;
  onChange: (html: string) => void;
  onFinish: () => void;
}

/**
 * The rich-text body of a note.
 *
 * The content is written into the element through a ref after sanitisation,
 * rather than with `dangerouslySetInnerHTML`, so there is exactly one place
 * where HTML enters the document and it is always cleaned first. Pasted content
 * is intercepted and sanitised before the browser inserts it.
 */
export function RichTextEditor({
  html,
  editing,
  placeholder,
  ariaLabel,
  onChange,
  onFinish,
}: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const lastWritten = useRef<string>('');

  // Only rewrite the DOM when the value genuinely differs, otherwise the caret
  // would jump to the start on every keystroke.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (html === lastWritten.current) return;
    lastWritten.current = html;
    element.innerHTML = sanitiseHtml(html);
  }, [html]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (editing) {
      element.focus();
      // Place the caret at the end of any existing text.
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      return;
    }

    // When editing finishes, hand focus back to the card so the arrow keys move
    // the note and Escape reaches the application.
    if (element.contains(document.activeElement)) {
      element.closest('article')?.focus();
    }
  }, [editing]);

  function emit(): void {
    const element = ref.current;
    if (!element) return;
    const cleaned = sanitiseHtml(element.innerHTML);
    lastWritten.current = cleaned;
    onChange(cleaned);
  }

  const isEmpty = html.replace(/<[^>]*>/g, '').trim() === '';

  return (
    <div
      ref={ref}
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      className="sb-rich-text h-full w-full overflow-auto text-sm"
      data-placeholder={placeholder}
      data-empty={isEmpty ? 'true' : 'false'}
      contentEditable={editing}
      suppressContentEditableWarning
      tabIndex={editing ? 0 : -1}
      onInput={emit}
      onBlur={emit}
      onPaste={(event) => {
        // Never let the browser insert raw clipboard HTML.
        event.preventDefault();
        const clipboardHtml = event.clipboardData.getData('text/html');
        const clipboardText = event.clipboardData.getData('text/plain');
        const fragment =
          clipboardHtml !== ''
            ? sanitiseHtml(clipboardHtml)
            : clipboardText.replace(/[&<>]/g, (character) =>
                character === '&' ? '&amp;' : character === '<' ? '&lt;' : '&gt;',
              );
        document.execCommand('insertHTML', false, fragment);
        emit();
      }}
      onKeyDown={(event) => {
        // These keys belong to the application unless the note is being edited.
        if (!editing) return;

        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          emit();
          onFinish();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          emit();
          onFinish();
        }
      }}
    />
  );
}
