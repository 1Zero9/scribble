import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoteCard } from '@/features/notes/NoteCard';
import { RichTextEditor } from '@/features/notes/RichTextEditor';
import { GridBackground } from '@/features/deskpad/GridBackground';
import type { Item } from '@/types/domain';

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'item-1',
    padId: 'pad-1',
    itemType: 'text',
    content: { kind: 'text', html: '<p>Call the supplier</p>' },
    x: 48,
    y: 96,
    width: 260,
    height: 160,
    zIndex: 1,
    colour: 'sand',
    pinned: false,
    project: null,
    bundleId: null,
    createdAt: '2026-08-18T09:00:00.000Z',
    updatedAt: '2026-08-18T09:00:00.000Z',
    archivedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

const noop = () => undefined;

function renderCard(overrides: Partial<Item> = {}, props: Record<string, unknown> = {}) {
  const handlers = {
    onSelect: vi.fn(),
    onBeginDrag: vi.fn(),
    onBeginResize: vi.fn(),
    onEdit: vi.fn(),
    onFinishEdit: vi.fn(),
    onContentChange: vi.fn(),
    onColour: vi.fn(),
    onPin: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onNudge: vi.fn(),
    onResizeBy: vi.fn(),
    onProject: vi.fn(),
  };

  render(
    <NoteCard
      item={makeItem(overrides)}
      selected={false}
      editing={false}
      snapEnabled
      {...handlers}
      {...props}
    />,
  );

  return handlers;
}

describe('NoteCard', () => {
  it('has an accessible name describing its content', () => {
    renderCard();
    expect(screen.getByRole('article', { name: /Call the supplier/ })).toBeInTheDocument();
  });

  it('is positioned and sized from the item geometry', () => {
    renderCard();
    const card = screen.getByTestId('note-card');
    expect(card).toHaveStyle({ left: '48px', top: '96px', width: '260px', height: '160px' });
  });

  it('is reachable by keyboard', () => {
    renderCard();
    expect(screen.getByTestId('note-card')).toHaveAttribute('tabindex', '0');
  });

  it('moves by one grid step with the arrow keys', async () => {
    const user = userEvent.setup();
    const handlers = renderCard();
    screen.getByTestId('note-card').focus();

    await user.keyboard('{ArrowRight}');
    expect(handlers.onNudge).toHaveBeenCalledWith(24, 0);

    await user.keyboard('{ArrowUp}');
    expect(handlers.onNudge).toHaveBeenCalledWith(0, -24);
  });

  it('moves by one pixel when Alt is held, ignoring the grid', async () => {
    const user = userEvent.setup();
    const handlers = renderCard();
    screen.getByTestId('note-card').focus();

    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(handlers.onNudge).toHaveBeenCalledWith(1, 0);
  });

  it('resizes with Shift and the arrow keys', async () => {
    const user = userEvent.setup();
    const handlers = renderCard();
    screen.getByTestId('note-card').focus();

    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
    expect(handlers.onResizeBy).toHaveBeenCalledWith(0, 24);
  });

  it('starts editing on Enter and deletes on Delete', async () => {
    const user = userEvent.setup();
    const handlers = renderCard();
    screen.getByTestId('note-card').focus();

    await user.keyboard('{Enter}');
    expect(handlers.onEdit).toHaveBeenCalled();

    await user.keyboard('{Delete}');
    expect(handlers.onDelete).toHaveBeenCalled();
  });

  it('shows resize handles only when selected', () => {
    const { rerender } = render(
      <NoteCard
        item={makeItem()}
        selected={false}
        editing={false}
        snapEnabled
        onSelect={noop}
        onBeginDrag={noop}
        onBeginResize={noop}
        onEdit={noop}
        onFinishEdit={noop}
        onContentChange={noop}
        onColour={noop}
        onPin={noop}
        onDuplicate={noop}
        onDelete={noop}
        onNudge={noop}
        onResizeBy={noop}
        onProject={noop}
      />,
    );
    expect(screen.queryByLabelText(/Resize from bottom right/)).not.toBeInTheDocument();

    rerender(
      <NoteCard
        item={makeItem()}
        selected
        editing={false}
        snapEnabled
        onSelect={noop}
        onBeginDrag={noop}
        onBeginResize={noop}
        onEdit={noop}
        onFinishEdit={noop}
        onContentChange={noop}
        onColour={noop}
        onPin={noop}
        onDuplicate={noop}
        onDelete={noop}
        onNudge={noop}
        onResizeBy={noop}
        onProject={noop}
      />,
    );
    expect(screen.getByLabelText(/Resize from bottom right/)).toBeInTheDocument();
  });

  it('announces a pinned note in text, not by colour alone', () => {
    renderCard({ pinned: true });
    expect(screen.getByText('Pinned')).toBeInTheDocument();
  });

  it('renders a checklist as real checkboxes', () => {
    renderCard({
      itemType: 'checklist',
      content: {
        kind: 'checklist',
        title: 'Before the meeting',
        entries: [
          { id: 'a', text: 'Print the agenda', done: true },
          { id: 'b', text: 'Book the room', done: false },
        ],
      },
    });

    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toBeChecked();
    expect(boxes[1]).not.toBeChecked();
  });

  it('labels a file card as a reference rather than a copy', () => {
    renderCard({
      itemType: 'file',
      content: {
        kind: 'file',
        path: 'C:/Reports/summary.pdf',
        fileName: 'summary.pdf',
        mode: 'reference',
        mimeType: 'application/pdf',
        byteSize: 2048,
        note: '',
      },
    });
    expect(screen.getByText('File reference — not copied')).toBeInTheDocument();
  });
});

describe('RichTextEditor', () => {
  it('exposes itself as a multi-line textbox', () => {
    render(
      <RichTextEditor
        html="<p>Hello</p>"
        editing
        placeholder="Write anything…"
        ariaLabel="Note text"
        onChange={noop}
        onFinish={noop}
      />,
    );
    const box = screen.getByRole('textbox', { name: 'Note text' });
    expect(box).toHaveAttribute('aria-multiline', 'true');
  });

  it('sanitises content before it reaches the document', async () => {
    render(
      <RichTextEditor
        html='<p>Safe</p><script>bad()</script><img src="x" onerror="bad()">'
        editing={false}
        placeholder=""
        ariaLabel="Note text"
        onChange={noop}
        onFinish={noop}
      />,
    );

    await waitFor(() => {
      const box = screen.getByRole('textbox', { name: 'Note text' });
      expect(box.innerHTML).toBe('<p>Safe</p>');
    });
  });

  it('finishes editing on Ctrl + Enter', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    render(
      <RichTextEditor
        html=""
        editing
        placeholder=""
        ariaLabel="Note text"
        onChange={noop}
        onFinish={onFinish}
      />,
    );

    screen.getByRole('textbox', { name: 'Note text' }).focus();
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(onFinish).toHaveBeenCalled();
  });
});

describe('GridBackground', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('draws dots by default', () => {
    const { container } = render(
      <GridBackground gridType="dots" viewport={{ x: 0, y: 0, zoom: 1 }} />,
    );
    expect(container.firstElementChild?.getAttribute('style')).toContain('radial-gradient');
  });

  it('draws lines when asked', () => {
    const { container } = render(
      <GridBackground gridType="lines" viewport={{ x: 0, y: 0, zoom: 1 }} />,
    );
    expect(container.firstElementChild?.getAttribute('style')).toContain('linear-gradient');
  });

  it('draws nothing when blank', () => {
    const { container } = render(
      <GridBackground gridType="blank" viewport={{ x: 0, y: 0, zoom: 1 }} />,
    );
    expect(container.firstElementChild?.getAttribute('style')).toBeNull();
  });

  it('is hidden from assistive technology', () => {
    const { container } = render(
      <GridBackground gridType="dots" viewport={{ x: 0, y: 0, zoom: 1 }} />,
    );
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});
