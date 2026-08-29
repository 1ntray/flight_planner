import type { MapTool } from './routeDisplay';

export interface MapToolControlProps {
  tool: MapTool;
  fromName: string | undefined;
  toName: string | undefined;
  onToolChange: (tool: MapTool) => void;
}

export function MapToolControl({
  tool,
  fromName,
  toName,
  onToolChange,
}: MapToolControlProps) {
  return (
    <div className="map-tool-control" role="toolbar" aria-label="Map tools">
      <button
        type="button"
        className={`button${tool.kind === 'select' ? ' button--active' : ''}`}
        aria-pressed={tool.kind === 'select'}
        aria-keyshortcuts="V"
        title="Select and edit (V)"
        onClick={() => onToolChange({ kind: 'select' })}
      >
        Select
        <kbd>V</kbd>
      </button>
      <button
        type="button"
        className={`button${tool.kind === 'add-waypoint' ? ' button--active' : ''}`}
        aria-pressed={tool.kind === 'add-waypoint'}
        aria-keyshortcuts="W"
        title="Add waypoints (W)"
        onClick={() =>
          onToolChange(
            tool.kind === 'add-waypoint'
              ? { kind: 'select' }
              : { kind: 'add-waypoint' },
          )
        }
      >
        Add waypoint
        <kbd>W</kbd>
      </button>
      {tool.kind === 'place-altitude-target' ? (
        <div className="map-tool-control__placement" role="status">
          <span>
            Place {tool.target === 'primary' ? 'planned' : 'end'} altitude target for{' '}
            <strong>{fromName ?? 'FROM'} → {toName ?? 'TO'}</strong>
          </span>
          <button
            type="button"
            className="button"
            aria-keyshortcuts="Escape"
            onClick={() => onToolChange({ kind: 'select' })}
          >
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}
