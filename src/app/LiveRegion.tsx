import { useUiStore } from '@/store/uiStore';

/**
 * A single polite live region.
 *
 * Note creation, deletion, restoration and every other structural change is
 * announced here so screen-reader users are told what happened on a canvas that
 * is otherwise highly visual.
 */
export function LiveRegion() {
  const announcement = useUiStore((state) => state.announcement);
  return (
    <div aria-live="polite" aria-atomic="true" className="sb-sr-only">
      {announcement}
    </div>
  );
}
