import { GRID_SIZE, type GridType, type Viewport } from '@/types/domain';

interface GridBackgroundProps {
  gridType: GridType;
  viewport: Viewport;
}

/**
 * The deskpad's surface texture.
 *
 * Dots imply a surface; lines imply a document. The default is a very faint dot
 * grid: enough structure to align against, but nothing that reads as graph paper
 * or a spreadsheet. It is drawn as a CSS background so it costs nothing to pan.
 */
export function GridBackground({ gridType, viewport }: GridBackgroundProps) {
  if (gridType === 'blank') {
    return <div className="pointer-events-none absolute inset-0" aria-hidden="true" />;
  }

  const size = GRID_SIZE * viewport.zoom;
  const offsetX = viewport.x % size;
  const offsetY = viewport.y % size;

  const style =
    gridType === 'dots'
      ? {
          backgroundImage: 'radial-gradient(circle, var(--sb-grid) 1px, transparent 1px)',
          backgroundSize: `${size}px ${size}px`,
          backgroundPosition: `${offsetX}px ${offsetY}px`,
        }
      : {
          backgroundImage:
            'linear-gradient(to right, var(--sb-grid) 1px, transparent 1px),' +
            'linear-gradient(to bottom, var(--sb-grid) 1px, transparent 1px)',
          backgroundSize: `${size}px ${size}px`,
          backgroundPosition: `${offsetX}px ${offsetY}px`,
          opacity: 0.6,
        };

  return <div className="pointer-events-none absolute inset-0" aria-hidden="true" style={style} />;
}
