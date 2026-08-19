import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createLogger } from '@/services/logging/logger';

const log = createLogger('ui');

interface Props {
  children: ReactNode;
  /** Shown instead of the children when something fails. */
  label: string;
}

interface State {
  failed: boolean;
}

/**
 * Keeps one broken area from taking down the whole deskpad. The error message
 * itself is never rendered: it can contain note content, so only a generic,
 * actionable message is shown and a redacted event is logged locally.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    log.error('boundary.caught');
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <div role="alert" className="sb-panel m-4 p-4 text-sm" style={{ color: 'var(--sb-text)' }}>
        <p className="font-semibold">{this.props.label} could not be displayed.</p>
        <p className="mt-1" style={{ color: 'var(--sb-text-muted)' }}>
          Your notes are still saved locally. Try closing and reopening this area, or restart
          Scribble.
        </p>
        <button
          type="button"
          className="sb-button mt-3"
          onClick={() => this.setState({ failed: false })}
        >
          Try again
        </button>
      </div>
    );
  }
}
