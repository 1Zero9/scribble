import type { NoteColour } from '@/types/domain';

/** Maps a note colour token onto its CSS custom property. */
export function noteBackground(colour: NoteColour): string {
  return `var(--sb-note-${colour})`;
}

export const RESIZE_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
export type ResizeHandle = (typeof RESIZE_HANDLES)[number];

export const HANDLE_LABELS: Record<ResizeHandle, string> = {
  nw: 'top left',
  n: 'top',
  ne: 'top right',
  e: 'right',
  se: 'bottom right',
  s: 'bottom',
  sw: 'bottom left',
  w: 'left',
};

export const HANDLE_CURSORS: Record<ResizeHandle, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
};

/** Position of each handle expressed as CSS insets. */
export const HANDLE_POSITION: Record<ResizeHandle, React.CSSProperties> = {
  nw: { top: -5, left: -5 },
  n: { top: -5, left: '50%', marginLeft: -5 },
  ne: { top: -5, right: -5 },
  e: { top: '50%', right: -5, marginTop: -5 },
  se: { bottom: -5, right: -5 },
  s: { bottom: -5, left: '50%', marginLeft: -5 },
  sw: { bottom: -5, left: -5 },
  w: { top: '50%', left: -5, marginTop: -5 },
};
