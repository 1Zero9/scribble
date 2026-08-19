import { useEffect, useState } from 'react';
import { formatClock, formatLongDate } from '@/lib/time';

interface DeskClockProps {
  showSeconds: boolean;
}

/**
 * Ambient date and time.
 *
 * This is context for the person at the desk, not part of their notes: it is
 * never included in an export, and it can be switched off entirely in Settings.
 */
export function DeskClock({ showSeconds }: DeskClockProps) {
  const [value, setValue] = useState(() => new Date());

  useEffect(() => {
    const interval = showSeconds ? 1000 : 15_000;
    const timer = setInterval(() => setValue(new Date()), interval);
    return () => clearInterval(timer);
  }, [showSeconds]);

  return (
    <div className="hidden text-right leading-tight sm:block" data-export-exclude="true">
      <div className="text-sm font-medium tabular-nums">
        <time dateTime={value.toISOString()}>{formatClock(value, showSeconds)}</time>
      </div>
      <div className="text-xs" style={{ color: 'var(--sb-text-muted)' }}>
        {formatLongDate(value)}
      </div>
    </div>
  );
}
