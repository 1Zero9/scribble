import { useEffect, useState } from 'react';
import { Download, Lock, ShieldCheck, TriangleAlert, Upload, Trash2 } from 'lucide-react';
import { GRID_TYPES, type GridType } from '@/types/domain';
import { AUTO_LOCK_OPTIONS, RETENTION_OPTIONS } from '@/services/settings/settings';
import { detectDictation, type DictationCapability } from '@/services/dictation/dictationService';
import { buildExport, importBundle } from '@/services/exportImport/bundle';
import { openBytes, saveBytes } from '@/services/exportImport/fileTransfer';
import { eraseAllData, openStorage } from '@/services/storage';
import { isDesktop } from '@/services/platform';
import { describeAccelerator } from '@/services/desktop/windowService';
import { describeError } from '@/services/logging/logger';
import { Panel } from '@/components/Panel';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { selectActivePad, useDeskStore } from '@/store/deskStore';
import { padDisplayName } from '@/services/search/search';

/** Settings, including a plain statement of what Scribble does and does not do. */
export function SettingsPanel() {
  const closePanel = useUiStore((state) => state.closePanel);
  const notify = useUiStore((state) => state.notify);
  const { settings, update } = useSettingsStore();
  const pad = useDeskStore(selectActivePad);
  const reloadAll = useDeskStore((state) => state.reloadAll);
  const updatePadPreferences = useDeskStore((state) => state.updatePadPreferences);

  const [capability, setCapability] = useState<DictationCapability | null>(null);
  const [location, setLocation] = useState('Loading…');
  const [busy, setBusy] = useState(false);
  const [confirmErase, setConfirmErase] = useState(false);

  useEffect(() => {
    void detectDictation().then(setCapability);
    void openStorage().then((storage) => setLocation(storage.location));
  }, []);

  async function runExport(padId?: string): Promise<void> {
    setBusy(true);
    try {
      const storage = await openStorage();
      const bundle = await buildExport(storage, padId === undefined ? {} : { padId });
      const saved = await saveBytes(bundle.fileName, bundle.bytes);
      if (saved !== null) {
        notify(
          `Exported ${bundle.manifest.counts.pads} pads and ${bundle.manifest.counts.items} notes.`,
          'success',
        );
      }
    } catch (error) {
      notify(describeError(error, 'The export could not be created.'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function runImport(): Promise<void> {
    setBusy(true);
    try {
      const file = await openBytes();
      if (file === null) return;
      const storage = await openStorage();
      const summary = await importBundle(storage, file.bytes);
      await reloadAll();
      notify(
        `Imported ${summary.pads} pads and ${summary.items} notes as new copies.` +
          (summary.skipped > 0 ? ` ${summary.skipped} items were skipped.` : ''),
        'success',
      );
    } catch (error) {
      notify(describeError(error, 'That file could not be imported.'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Settings" onClose={closePanel} width="wide">
      <Section title="Deskpad">
        <Field label="Grid" htmlFor="setting-grid">
          <select
            id="setting-grid"
            className="sb-input"
            value={pad?.gridType ?? settings.gridType}
            onChange={(event) => {
              const gridType = event.target.value as GridType;
              void update('gridType', gridType);
              void updatePadPreferences({ gridType });
            }}
          >
            {GRID_TYPES.map((type) => (
              <option key={type} value={type}>
                {type === 'dots' ? 'Dots (recommended)' : type === 'lines' ? 'Lines' : 'Blank'}
              </option>
            ))}
          </select>
        </Field>

        <Toggle
          label="Snap notes to the grid"
          description="Hold Alt while dragging to place a note freely."
          checked={pad?.snapEnabled ?? settings.snapEnabled}
          onChange={(checked) => {
            void update('snapEnabled', checked);
            void updatePadPreferences({ snapEnabled: checked });
          }}
        />

        <Toggle
          label="Show the date and clock"
          description="Ambient context only. It is never included in an export."
          checked={settings.showClock}
          onChange={(checked) => void update('showClock', checked)}
        />
        <Toggle
          label="Show seconds"
          checked={settings.showSeconds}
          onChange={(checked) => void update('showSeconds', checked)}
        />
        <Toggle
          label="Keep the capture toolbar open"
          checked={settings.toolbarPinned}
          onChange={(checked) => void update('toolbarPinned', checked)}
        />
      </Section>

      <Section title="Appearance">
        <Field label="Theme" htmlFor="setting-theme">
          <select
            id="setting-theme"
            className="sb-input"
            value={settings.theme}
            onChange={(event) =>
              void update('theme', event.target.value as 'light' | 'dark' | 'system')
            }
          >
            <option value="system">Match Windows</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </Field>
      </Section>

      <Section title="Summoning Scribble">
        <Field label="Global shortcut" htmlFor="setting-shortcut">
          <input
            id="setting-shortcut"
            className="sb-input"
            value={settings.globalShortcut}
            onChange={(event) => void update('globalShortcut', event.target.value)}
            aria-describedby="shortcut-help"
          />
        </Field>
        <p id="shortcut-help" className="text-xs" style={{ color: 'var(--sb-text-muted)' }}>
          Currently {describeAccelerator(settings.globalShortcut)}. Use names such as{' '}
          <code>CmdOrControl</code>, <code>Shift</code>, <code>Alt</code> and a key, joined with{' '}
          <code>+</code>.
        </p>
        <Toggle
          label="Hide Scribble when Escape is pressed"
          checked={settings.hideOnEscape}
          onChange={(checked) => void update('hideOnEscape', checked)}
        />
      </Section>

      <Section title="Dictation">
        <div
          className="flex items-start gap-2 rounded-[var(--sb-radius-control)] p-3 text-xs"
          style={{
            background:
              capability?.processing === 'local'
                ? 'var(--sb-success-soft)'
                : 'var(--sb-warning-soft)',
            border: '1px solid var(--sb-border)',
          }}
        >
          {capability?.processing === 'local' ? (
            <ShieldCheck size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          ) : (
            <TriangleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          )}
          <p>{capability?.description ?? 'Checking what is available on this device…'}</p>
        </div>

        <Toggle
          label="Enable dictation"
          description="Scribble never records in the background. A session must be started and stopped by you, and no audio is kept."
          checked={settings.dictationEnabled}
          disabled={capability?.available !== true}
          onChange={(checked) => void update('dictationEnabled', checked)}
        />
      </Section>

      <Section title="Privacy and data">
        <div
          className="flex items-start gap-2 rounded-[var(--sb-radius-control)] p-3 text-xs"
          style={{ background: 'var(--sb-success-soft)', border: '1px solid var(--sb-border)' }}
        >
          <ShieldCheck
            size={16}
            aria-hidden="true"
            className="mt-0.5 shrink-0"
            style={{ color: 'var(--sb-success)' }}
          />
          <div>
            <p className="font-medium">Everything stays on this device.</p>
            <ul className="mt-1 list-disc pl-4">
              <li>No account, sign-in or cloud service.</li>
              <li>No analytics, telemetry or advertising.</li>
              <li>No background screen, clipboard, email or Teams monitoring.</li>
              <li>No fonts or other assets fetched from the internet.</li>
              <li>Links open in your own browser; Scribble never loads remote pages itself.</li>
            </ul>
            <p className="mt-2">
              Data location: <code className="break-all">{location}</code>
            </p>
            <p className="mt-1" style={{ color: 'var(--sb-text-muted)' }}>
              Local data is not yet encrypted at rest by Scribble itself. See{' '}
              <code>docs/PRIVACY.md</code> and <code>KNOWN_LIMITATIONS.md</code>.
            </p>
          </div>
        </div>

        <Field label="Keep deleted material for" htmlFor="setting-retention">
          <select
            id="setting-retention"
            className="sb-input"
            value={settings.retentionDays}
            onChange={(event) => void update('retentionDays', Number(event.target.value))}
          >
            {RETENTION_OPTIONS.map((days) => (
              <option key={days} value={days}>
                {days} days
              </option>
            ))}
          </select>
        </Field>

        <Field label="Lock Scribble after" htmlFor="setting-lock">
          <select
            id="setting-lock"
            className="sb-input"
            value={settings.autoLockMinutes}
            onChange={(event) => void update('autoLockMinutes', Number(event.target.value))}
          >
            {AUTO_LOCK_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes === 0
                  ? 'Never'
                  : `${minutes} minute${minutes === 1 ? '' : 's'} of inactivity`}
              </option>
            ))}
          </select>
        </Field>
        <p className="flex items-start gap-2 text-xs" style={{ color: 'var(--sb-text-muted)' }}>
          <Lock size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
          Locking hides your notes behind a screen in this window. It is a privacy screen, not
          encryption, and does not protect the database file itself.
        </p>
      </Section>

      <Section title="Export and import">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="sb-button"
            disabled={busy}
            onClick={() => void runExport()}
          >
            <Download size={15} aria-hidden="true" />
            Export all data
          </button>
          <button
            type="button"
            className="sb-button"
            disabled={busy || pad === null}
            onClick={() => pad && void runExport(pad.id)}
          >
            <Download size={15} aria-hidden="true" />
            Export “{pad ? padDisplayName(pad) : 'this pad'}”
          </button>
          <button
            type="button"
            className="sb-button"
            disabled={busy}
            onClick={() => void runImport()}
          >
            <Upload size={15} aria-hidden="true" />
            Import an export
          </button>
        </div>
        <p className="text-xs" style={{ color: 'var(--sb-text-muted)' }}>
          Exports are a plain <code>.zip</code> containing JSON, Markdown and any images you added.
          Imports always arrive as new pads, so nothing you already have is overwritten.
        </p>
      </Section>

      <Section title="Delete everything">
        <button
          type="button"
          className="sb-button sb-button--danger"
          disabled={busy}
          onClick={() => setConfirmErase(true)}
        >
          <Trash2 size={15} aria-hidden="true" />
          Delete all Scribble data
        </button>
        <p className="text-xs" style={{ color: 'var(--sb-text-muted)' }}>
          Removes every pad, note, pen stroke and preference from this device.
        </p>
      </Section>

      {!isDesktop() ? (
        <p
          className="mt-4 flex items-start gap-2 rounded-[var(--sb-radius-control)] p-3 text-xs"
          style={{ background: 'var(--sb-warning-soft)', border: '1px solid var(--sb-border)' }}
        >
          <TriangleAlert size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
          You are running the browser development build. The tray icon, global shortcut, file
          dialogs and protected application-data storage are only available in the packaged desktop
          application.
        </p>
      ) : null}

      {confirmErase ? (
        <ConfirmDialog
          title="Delete all Scribble data?"
          message="Every pad, note and pen stroke stored on this device will be removed. This cannot be undone. Export first if you want to keep a copy."
          confirmLabel="Delete everything"
          tone="danger"
          onCancel={() => setConfirmErase(false)}
          onConfirm={() => {
            setConfirmErase(false);
            void (async () => {
              try {
                const storage = await openStorage();
                await eraseAllData(storage);
                await reloadAll();
                notify('All Scribble data has been deleted from this device.', 'success');
              } catch (error) {
                notify(describeError(error, 'The data could not be deleted.'), 'error');
              }
            })();
          }}
        />
      ) : null}
    </Panel>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <label htmlFor={htmlFor} className="text-sm">
        {label}
      </label>
      <div style={{ width: 220 }}>{children}</div>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled ?? false}
        onChange={(event) => onChange(event.target.checked)}
        style={{ accentColor: 'var(--sb-accent)', width: 16, height: 16, marginTop: 3 }}
      />
      <span className="min-w-0">
        <span className={disabled === true ? 'opacity-60' : ''}>{label}</span>
        {description ? (
          <span className="block text-xs" style={{ color: 'var(--sb-text-muted)' }}>
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}
