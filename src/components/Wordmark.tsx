import { SquareDashed } from 'lucide-react';

/**
 * Temporary wordmark.
 *
 * This is intentionally a plain neutral mark, not a brand identity. It uses the
 * same design tokens as everything else, so replacing it later is a local change.
 */
export function Wordmark() {
  return (
    <div className="flex items-center gap-2" aria-hidden="true">
      <span
        className="flex h-7 w-7 items-center justify-center rounded-md"
        style={{ background: 'var(--sb-accent-soft)', color: 'var(--sb-accent-strong)' }}
      >
        <SquareDashed size={16} />
      </span>
      <span className="font-display text-[15px] font-semibold tracking-tight">Scribble</span>
    </div>
  );
}
