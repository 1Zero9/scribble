import { create } from 'zustand';
import { newId } from '@/lib/ids';

export type PanelName = 'drawer' | 'search' | 'settings' | 'organise' | 'shortcuts' | null;
export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  tone: ToastTone;
  message: string;
  /** Optional single action, e.g. "Undo". */
  action?: { label: string; run: () => void };
}

export type CanvasTool = 'select' | 'ink' | 'eraser';

interface UiState {
  panel: PanelName;
  tool: CanvasTool;
  toolbarExpanded: boolean;
  /** Text announced to screen readers via a polite live region. */
  announcement: string;
  toasts: Toast[];
  locked: boolean;

  openPanel: (panel: Exclude<PanelName, null>) => void;
  closePanel: () => void;
  togglePanel: (panel: Exclude<PanelName, null>) => void;
  setTool: (tool: CanvasTool) => void;
  setToolbarExpanded: (expanded: boolean) => void;
  announce: (message: string) => void;
  notify: (message: string, tone?: ToastTone, action?: Toast['action']) => void;
  dismissToast: (id: string) => void;
  setLocked: (locked: boolean) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  panel: null,
  tool: 'select',
  toolbarExpanded: false,
  announcement: '',
  toasts: [],
  locked: false,

  openPanel: (panel) => set({ panel }),
  closePanel: () => set({ panel: null }),
  togglePanel: (panel) => set({ panel: get().panel === panel ? null : panel }),
  setTool: (tool) => set({ tool }),
  setToolbarExpanded: (toolbarExpanded) => set({ toolbarExpanded }),

  // A trailing space is appended when the text repeats so assistive technology
  // announces consecutive identical messages.
  announce: (message) =>
    set((state) => ({
      announcement: state.announcement === message ? `${message} ` : message,
    })),

  notify: (message, tone = 'info', action) => {
    const toast: Toast = { id: newId(), tone, message, ...(action ? { action } : {}) };
    set((state) => ({ toasts: [...state.toasts, toast].slice(-4) }));
    const lifetime = tone === 'error' ? 9000 : 5000;
    setTimeout(() => get().dismissToast(toast.id), lifetime);
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  setLocked: (locked) => set({ locked }),
}));
