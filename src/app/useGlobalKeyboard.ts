import { useEffect } from 'react';
import { newId } from '@/lib/ids';
import { hideWindow } from '@/services/desktop/windowService';
import { useDeskStore } from '@/store/deskStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { screenToPad } from '@/lib/geometry';

/**
 * The application-wide keyboard map.
 *
 * Every toolbar action has a keyboard route, which is what makes the deskpad
 * usable without a pointer. Shortcuts are suppressed while the user is typing so
 * they can never swallow a keystroke meant for a note.
 */
export function useGlobalKeyboard(): void {
  const hideOnEscape = useSettingsStore((state) => state.settings.hideOnEscape);

  useEffect(() => {
    function isTyping(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      );
    }

    function onKeyDown(event: KeyboardEvent): void {
      const ui = useUiStore.getState();
      const desk = useDeskStore.getState();
      const typing = isTyping(event.target);
      const modifier = event.ctrlKey || event.metaKey;

      if (event.key === 'Escape') {
        if (ui.panel !== null) {
          ui.closePanel();
          return;
        }
        if (desk.editingItemId !== null) {
          desk.setEditingItem(null);
          return;
        }
        if (desk.selection.length > 0) {
          desk.clearSelection();
          return;
        }
        if (hideOnEscape && !typing) {
          void desk.flush().then(() => hideWindow());
        }
        return;
      }

      if (modifier && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        ui.togglePanel('search');
        return;
      }
      if (modifier && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        ui.togglePanel('drawer');
        return;
      }
      if (modifier && event.key === ',') {
        event.preventDefault();
        ui.togglePanel('settings');
        return;
      }
      if (modifier && event.key.toLowerCase() === 'g') {
        event.preventDefault();
        ui.togglePanel('organise');
        return;
      }
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        void desk.createPad();
        return;
      }
      if (modifier && event.key === '?') {
        event.preventDefault();
        ui.togglePanel('shortcuts');
        return;
      }
      if (modifier && event.key.toLowerCase() === 'z' && ui.tool !== 'select') {
        event.preventDefault();
        void (event.shiftKey ? desk.redoInk() : desk.undoInk());
        return;
      }

      if (typing || modifier) return;

      const centre = screenToPad({ x: 240, y: 200 }, desk.viewport);

      switch (event.key.toLowerCase()) {
        case 'n':
          event.preventDefault();
          void desk.createItem('text', { kind: 'text', html: '' }, centre);
          break;
        case 'c':
          event.preventDefault();
          void desk.createItem(
            'checklist',
            { kind: 'checklist', title: '', entries: [{ id: newId(), text: '', done: false }] },
            centre,
          );
          break;
        case 'p':
          event.preventDefault();
          ui.setTool(ui.tool === 'ink' ? 'select' : 'ink');
          break;
        case 'e':
          event.preventDefault();
          ui.setTool(ui.tool === 'eraser' ? 'select' : 'eraser');
          break;
        case 'v':
          event.preventDefault();
          ui.setTool('select');
          break;
        case 'a':
          if (event.shiftKey) {
            event.preventDefault();
            desk.setSelection(desk.items.map((item) => item.id));
            ui.announce(`${desk.items.length} notes selected.`);
          }
          break;
        case 'delete':
        case 'backspace':
          if (desk.selection.length > 0) {
            event.preventDefault();
            void desk.deleteItems(desk.selection);
          }
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hideOnEscape]);
}

export const SHORTCUTS: Array<{ keys: string; action: string }> = [
  { keys: 'Ctrl + Shift + Space', action: 'Show or hide Scribble (configurable)' },
  { keys: 'Escape', action: 'Close a panel, finish editing, or hide Scribble' },
  { keys: 'Double-click the pad', action: 'Create a note where you clicked' },
  { keys: 'N', action: 'New note' },
  { keys: 'C', action: 'New checklist' },
  { keys: 'P', action: 'Pen' },
  { keys: 'E', action: 'Eraser' },
  { keys: 'V', action: 'Select tool' },
  { keys: 'Ctrl + Enter', action: 'Finish editing the current note' },
  { keys: 'Arrow keys', action: 'Move the focused note by one grid step' },
  { keys: 'Shift + arrow keys', action: 'Resize the focused note' },
  { keys: 'Alt + arrow keys', action: 'Move by one pixel, ignoring the grid' },
  { keys: 'Enter or F2', action: 'Edit the focused note' },
  { keys: 'Delete', action: 'Delete the selected notes' },
  { keys: 'Shift + A', action: 'Select every note on the pad' },
  { keys: 'Shift + click', action: 'Add a note to the selection' },
  { keys: 'Alt + drag', action: 'Move or resize without snapping' },
  { keys: 'Ctrl + F', action: 'Search' },
  { keys: 'Ctrl + D', action: 'Drawer' },
  { keys: 'Ctrl + G', action: 'Organise' },
  { keys: 'Ctrl + ,', action: 'Settings' },
  { keys: 'Ctrl + Shift + N', action: 'New pad' },
  { keys: 'Ctrl + Z', action: 'Undo ink (while the pen is active)' },
  { keys: 'Ctrl + scroll', action: 'Zoom the pad' },
];
