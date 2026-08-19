import { useEffect, useState } from 'react';
import { Mic, MicOff, ShieldCheck, TriangleAlert } from 'lucide-react';
import {
  detectDictation,
  webSpeechEngine,
  type DictationCapability,
  type DictationSession,
} from '@/services/dictation/dictationService';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { useDeskStore } from '@/store/deskStore';
import { textToHtml } from '@/services/security/sanitise';
import { describeError } from '@/services/logging/logger';

/**
 * The Dictate control.
 *
 * The button states are honest by design. Dictation is disabled unless a
 * capability has been detected *and* the user has explicitly enabled it in
 * Settings, having read where their audio would be processed. A session must be
 * started and stopped deliberately, a visible indicator is shown throughout, and
 * no audio is recorded, buffered or retained by Scribble at any point.
 */
export function DictateButton() {
  const [capability, setCapability] = useState<DictationCapability | null>(null);
  const [session, setSession] = useState<DictationSession | null>(null);
  const [partial, setPartial] = useState('');

  const settings = useSettingsStore((state) => state.settings);
  const notify = useUiStore((state) => state.notify);
  const announce = useUiStore((state) => state.announce);
  const openPanel = useUiStore((state) => state.openPanel);
  const createItem = useDeskStore((state) => state.createItem);
  const viewport = useDeskStore((state) => state.viewport);

  useEffect(() => {
    void detectDictation().then(setCapability);
  }, []);

  const enabled = capability?.available === true && settings.dictationEnabled;

  async function start(): Promise<void> {
    if (!enabled) {
      notify(
        capability?.available === true
          ? 'Dictation is switched off. You can enable it in Settings, where Scribble explains ' +
              'where your audio would be processed.'
          : 'No speech recognition is available on this device.',
        'warning',
        { label: 'Open Settings', run: () => openPanel('settings') },
      );
      return;
    }

    let collected = '';
    try {
      const started = await webSpeechEngine.start({
        onPartial: setPartial,
        onFinal: (text) => {
          collected += `${text} `;
          setPartial('');
        },
        onError: (message) => notify(message, 'error'),
        onEnd: () => {
          setSession(null);
          setPartial('');
          const finalText = collected.trim();
          if (finalText !== '') {
            void createItem(
              'text',
              { kind: 'text', html: textToHtml(finalText) },
              { x: -viewport.x / viewport.zoom + 160, y: -viewport.y / viewport.zoom + 160 },
              { focus: false },
            );
            announce('Dictated note created.');
          }
        },
      });
      setSession(started);
      announce('Dictation started. Scribble is listening.');
    } catch (error) {
      notify(describeError(error, 'Dictation could not be started.'), 'error');
    }
  }

  function stop(): void {
    session?.stop();
    setSession(null);
    announce('Dictation stopped.');
  }

  const recording = session !== null;
  const Icon = enabled ? Mic : MicOff;

  return (
    <div className="relative">
      <button
        type="button"
        className="sb-icon-button"
        aria-pressed={recording}
        onClick={() => (recording ? stop() : void start())}
        title={
          enabled
            ? recording
              ? 'Stop dictation'
              : 'Start dictation'
            : 'Dictation is switched off — see Settings'
        }
        style={
          recording ? { background: 'var(--sb-danger-soft)', color: 'var(--sb-danger)' } : undefined
        }
      >
        <Icon size={18} aria-hidden="true" />
        <span className="sb-sr-only">
          {recording ? 'Stop dictation' : 'Start dictation'}
          {enabled ? '' : ' (currently disabled)'}
        </span>
      </button>

      {recording ? (
        <div
          className="sb-panel absolute bottom-14 left-1/2 flex w-64 -translate-x-1/2 flex-col gap-1 px-3 py-2 text-xs"
          role="status"
        >
          <span
            className="flex items-center gap-2 font-medium"
            style={{ color: 'var(--sb-danger)' }}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: 'var(--sb-danger)' }}
              aria-hidden="true"
            />
            Recording — dictation in progress
          </span>
          <span style={{ color: 'var(--sb-text-muted)' }}>
            {capability?.processing === 'local' ? (
              <span className="flex items-center gap-1">
                <ShieldCheck size={12} aria-hidden="true" /> Processed on this device.
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <TriangleAlert size={12} aria-hidden="true" /> May use an external service.
              </span>
            )}
          </span>
          {partial !== '' ? <span className="truncate italic">{partial}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
