import type { ItemPatch } from '@/services/storage';
import type { Uuid } from '@/types/domain';

/**
 * Autosave.
 *
 * Notes have no Save button. Every edit is written to the local database, but
 * keystroke-by-keystroke writes would be wasteful, so patches for the same item
 * are merged and flushed shortly after typing stops. Anything still pending is
 * flushed when the pad changes, when the window is hidden and before the
 * application closes, so no edit can be lost.
 */
export const AUTOSAVE_DELAY_MS = 400;

type Flush = (patches: ReadonlyArray<{ id: Uuid; patch: ItemPatch }>) => Promise<void>;

export interface AutosaveQueue {
  enqueue(id: Uuid, patch: ItemPatch): void;
  flush(): Promise<void>;
  pendingCount(): number;
}

export function createAutosaveQueue(flush: Flush, delay = AUTOSAVE_DELAY_MS): AutosaveQueue {
  const pending = new Map<Uuid, ItemPatch>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> = Promise.resolve();

  async function run(): Promise<void> {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending.size === 0) return inFlight;

    const batch = [...pending.entries()].map(([id, patch]) => ({ id, patch }));
    pending.clear();
    inFlight = inFlight.then(() => flush(batch));
    return inFlight;
  }

  return {
    enqueue(id, patch) {
      pending.set(id, { ...pending.get(id), ...patch });
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => void run(), delay);
    },
    flush: run,
    pendingCount: () => pending.size,
  };
}
