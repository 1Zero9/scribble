import { expect, test, type Page } from '@playwright/test';

/**
 * Critical user-interface tests.
 *
 * These run against the browser build, which uses the same React application,
 * the same repositories and the same SQLite schema as the desktop version — only
 * the storage adapter differs. That keeps the important journeys covered on any
 * machine, including ones without a Rust toolchain.
 */

const SURFACE = '[data-testid="deskpad-surface"]';
const CARD = '[data-testid="note-card"]';
const INK = '[data-testid="ink-layer"] path';

// Each Playwright test runs in its own browser context, so IndexedDB — and
// therefore Scribble's database — starts empty without any explicit clean-up.
async function freshPad(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('application')).toBeVisible({ timeout: 20_000 });
}

/** The capture toolbar collapses when it is not in use. */
async function openCaptureToolbar(page: Page): Promise<void> {
  const expand = page.getByRole('button', { name: 'Expand capture toolbar' });
  if (await expand.isVisible()) await expand.click();
}

async function createNote(page: Page, x: number, y: number, text: string): Promise<void> {
  await page.locator(SURFACE).dblclick({ position: { x, y } });
  // Only the note being edited is editable, so this identifies the new note.
  await expect(page.locator('[role="textbox"][contenteditable="true"]')).toBeFocused();
  await page.keyboard.type(text);
  await page.keyboard.press('Control+Enter');
}

test.beforeEach(async ({ page }) => {
  await freshPad(page);
});

test('creates a note by double-clicking the deskpad', async ({ page }) => {
  await createNote(page, 300, 250, 'Call the supplier');

  await expect(page.locator(CARD)).toHaveCount(1);
  await expect(page.locator(CARD)).toContainText('Call the supplier');
});

test('a new note receives keyboard focus immediately', async ({ page }) => {
  await page.locator(SURFACE).dblclick({ position: { x: 320, y: 260 } });
  await expect(page.getByRole('textbox', { name: 'Note text' })).toBeFocused();
});

test('notes autosave and are restored after a reload', async ({ page }) => {
  await createNote(page, 300, 250, 'Survives a restart');
  // Give the autosave queue and the storage adapter time to flush.
  await page.waitForTimeout(1200);

  await page.reload();
  await expect(page.getByRole('application')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(CARD)).toContainText('Survives a restart');
});

test('a note can be moved with the keyboard and snaps to the grid', async ({ page }) => {
  await createNote(page, 300, 250, 'Movable');

  const card = page.locator(CARD).first();
  await card.click();
  await card.press('ArrowRight');
  await card.press('ArrowRight');

  const left = await card.evaluate((element) => Number.parseFloat(getComputedStyle(element).left));
  expect(left % 24).toBe(0);
});

test('a note can be resized with the keyboard', async ({ page }) => {
  await createNote(page, 300, 250, 'Resizable');

  const card = page.locator(CARD).first();
  await card.click();
  const before = await card.evaluate((element) => element.getBoundingClientRect().height);

  await card.press('Shift+ArrowDown');
  await card.press('Shift+ArrowDown');

  const after = await card.evaluate((element) => element.getBoundingClientRect().height);
  expect(after).toBeGreaterThan(before);
});

test('a note can be dragged with the pointer', async ({ page }) => {
  await createNote(page, 300, 250, 'Draggable');

  const card = page.locator(CARD).first();
  const start = await card.boundingBox();
  expect(start).not.toBeNull();

  await page.mouse.move(start!.x + 40, start!.y + 100);
  await page.mouse.down();
  await page.mouse.move(start!.x + 240, start!.y + 200, { steps: 12 });
  await page.mouse.up();

  const end = await card.boundingBox();
  expect(end!.x).toBeGreaterThan(start!.x + 100);
});

test('a deleted note can be restored from the Drawer', async ({ page }) => {
  await createNote(page, 300, 250, 'Deleted then restored');

  const card = page.locator(CARD).first();
  await card.click();
  await card.press('Delete');
  await expect(page.locator(CARD)).toHaveCount(0);

  await page.getByRole('button', { name: 'Pads and Drawer' }).click();
  await page.getByRole('tab', { name: 'Recently deleted' }).click();
  await page.getByRole('button', { name: 'Restore this note' }).first().click();
  await page.getByRole('button', { name: /Close Drawer/ }).click();

  await expect(page.locator(CARD)).toContainText('Deleted then restored');
});

test('selected notes can be tidied and aligned', async ({ page }) => {
  await createNote(page, 200, 200, 'One');
  await createNote(page, 520, 380, 'Two');
  await createNote(page, 340, 560, 'Three');

  await page.keyboard.press('Shift+A');
  await expect(page.getByRole('toolbar', { name: /3 selected notes/ })).toBeVisible();

  await page.getByRole('button', { name: 'Align left' }).click();

  const lefts = await page
    .locator(CARD)
    .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).left));
  expect(new Set(lefts).size).toBe(1);
});

test('a second pad can be created and both are listed', async ({ page }) => {
  await createNote(page, 300, 250, 'On the first pad');

  await page.getByRole('button', { name: 'New pad' }).click();
  await expect(page.locator(CARD)).toHaveCount(0);

  await page.getByRole('button', { name: 'Pads and Drawer' }).click();
  await expect(page.getByRole('button', { name: 'Open pad' })).toHaveCount(2);
});

test('notes can be found by searching', async ({ page }) => {
  await createNote(page, 300, 250, 'Quarterly stocktake plan');
  await page.waitForTimeout(800);

  await page.getByRole('button', { name: 'Search', exact: true }).click();

  const panel = page.getByRole('dialog', { name: 'Search' });
  await panel.getByRole('searchbox', { name: 'Search pads and notes' }).fill('stocktake');

  await expect(panel.getByText('Quarterly stocktake plan')).toBeVisible();
});

test('the Organise panel produces reviewable suggestions and changes nothing on its own', async ({
  page,
}) => {
  await createNote(page, 200, 200, 'Need to send the risk report');
  await createNote(page, 520, 200, 'Chase the supplier for a quote');

  // Clear the selection so the organiser reviews the whole pad.
  await page.keyboard.press('Escape');

  await openCaptureToolbar(page);
  await page.getByRole('button', { name: /^Organise/ }).click();

  const panel = page.getByRole('dialog', { name: 'Organise' });
  await expect(panel.getByText(/Local, rules-based, and reviewable/)).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Actions' })).toBeVisible();

  await page.getByRole('button', { name: /Close Organise/ }).click();
  await expect(page.locator(CARD)).toHaveCount(2);
});

test('pen strokes can be drawn and survive a reload', async ({ page }) => {
  await page.keyboard.press('p');
  await expect(page.getByRole('toolbar', { name: 'Pen and ink' })).toBeVisible();

  const surface = page.locator(SURFACE);
  const box = await surface.boundingBox();
  await page.mouse.move(box!.x + 200, box!.y + 200);
  await page.mouse.down();
  await page.mouse.move(box!.x + 300, box!.y + 260, { steps: 10 });
  await page.mouse.move(box!.x + 400, box!.y + 220, { steps: 10 });
  await page.mouse.up();

  await expect(page.locator(INK)).toHaveCount(1);

  await page.waitForTimeout(1000);
  await page.reload();
  await expect(page.getByRole('application')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(INK)).toHaveCount(1);
});

test('the toolbars stay usable while the pen is active', async ({ page }) => {
  await createNote(page, 300, 250, 'A pinned note sits high in the stack');
  await page.locator(CARD).first().click();
  await page.getByRole('button', { name: 'Pin note' }).click();

  await page.keyboard.press('p');

  // The ink layer covers the whole surface, so it must not swallow clicks meant
  // for anything floating above it.
  await page.getByRole('button', { name: 'Eraser tool' }).click();
  await expect(page.getByRole('button', { name: 'Eraser tool' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('button', { name: 'Select tool' }).click();
  await expect(page.getByRole('toolbar', { name: 'Pen and ink' })).toBeHidden();
});

test('dropped text becomes a note and a dropped URL becomes a link card', async ({ page }) => {
  await page.locator(SURFACE).evaluate((surface) => {
    const transfer = new DataTransfer();
    transfer.setData('text/plain', 'https://example.com/handbook');
    surface.dispatchEvent(
      new DragEvent('drop', { dataTransfer: transfer, bubbles: true, clientX: 400, clientY: 300 }),
    );
  });

  await expect(page.locator('[data-testid="note-card"] .sb-chip')).toHaveText('Link');
  await expect(page.getByRole('button', { name: 'Open in browser' })).toBeVisible();
});

test('the application makes no network requests', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (
      !url.startsWith('http://127.0.0.1:1420') &&
      !url.startsWith('data:') &&
      !url.startsWith('blob:')
    ) {
      external.push(url);
    }
  });

  await createNote(page, 300, 250, 'No network please');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.waitForTimeout(500);

  expect(external).toEqual([]);
});
