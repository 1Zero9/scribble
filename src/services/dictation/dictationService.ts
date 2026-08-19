/**
 * Dictation service abstraction.
 *
 * Scribble will not silently send a user's voice to a cloud service. This module
 * therefore separates two questions:
 *
 *   1. Is a speech-recognition engine present at all?
 *   2. Can Scribble *confirm* that it processes audio on this device only?
 *
 * Dictation stays disabled unless (2) is true. The browser `SpeechRecognition`
 * API is detected and described honestly: in Chromium-based engines it normally
 * streams audio to a remote service, and there is no reliable way to prove
 * otherwise, so it is reported as `external` and is not enabled by default.
 *
 * A future on-device engine only needs to implement `DictationEngine` and report
 * `processing: 'local'`.
 */

export type DictationProcessing = 'local' | 'external' | 'unknown';

export interface DictationCapability {
  available: boolean;
  processing: DictationProcessing;
  /** Plain-language explanation shown directly in the interface. */
  description: string;
  engineName: string;
}

export interface DictationSession {
  stop(): void;
}

export interface DictationCallbacks {
  onPartial(text: string): void;
  onFinal(text: string): void;
  onError(message: string): void;
  onEnd(): void;
}

export interface DictationEngine {
  readonly name: string;
  detect(): Promise<DictationCapability>;
  start(callbacks: DictationCallbacks): Promise<DictationSession>;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function findSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const candidate =
    (window as unknown as Record<string, unknown>).SpeechRecognition ??
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  return typeof candidate === 'function' ? (candidate as SpeechRecognitionConstructor) : null;
}

/**
 * The only engine shipped in this prototype. It is deliberately reported as
 * `external`, which keeps dictation switched off until the user opts in with
 * full knowledge of where their audio goes.
 */
export const webSpeechEngine: DictationEngine = {
  name: 'Browser speech recognition',

  async detect() {
    const Recognition = findSpeechRecognition();
    if (Recognition === null) {
      return {
        available: false,
        processing: 'unknown',
        engineName: 'None',
        description:
          'No speech-recognition engine was found on this device, so dictation is unavailable.',
      };
    }
    return {
      available: true,
      processing: 'external',
      engineName: 'Browser speech recognition',
      description:
        'A speech-recognition engine is available, but Scribble cannot confirm that it ' +
        'processes audio on this device. It may send audio to an external service. ' +
        'Dictation stays switched off until you enable it in Settings.',
    };
  },

  async start(callbacks) {
    const Recognition = findSpeechRecognition();
    if (Recognition === null) throw new Error('Dictation is not available on this device.');

    const recognition = new Recognition();
    recognition.lang = 'en-GB';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result) continue;
        const transcript = result[0].transcript;
        if (result.isFinal) callbacks.onFinal(transcript);
        else callbacks.onPartial(transcript);
      }
    };
    recognition.onerror = (event) => {
      callbacks.onError(
        event.error === 'not-allowed'
          ? 'Microphone access was refused.'
          : 'Dictation stopped unexpectedly.',
      );
    };
    recognition.onend = () => callbacks.onEnd();

    recognition.start();
    // Audio is never buffered or written to disk by Scribble: only the returned
    // text is used, and only while a session is explicitly running.
    return { stop: () => recognition.stop() };
  },
};

let cachedCapability: Promise<DictationCapability> | null = null;

export function detectDictation(
  engine: DictationEngine = webSpeechEngine,
): Promise<DictationCapability> {
  cachedCapability ??= engine.detect();
  return cachedCapability;
}
