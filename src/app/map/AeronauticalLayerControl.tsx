import type { AeronauticalDatasetRef } from '../../domain';
import {
  AERONAUTICAL_LAYER_DEFINITIONS,
} from './aeronauticalLayerConfig';
import type {
  AeronauticalLayerId,
  AeronauticalLayerVisibility,
} from './aeronauticalLayerConfig';
import type { AeronauticalLoadStatus } from './AeronauticalLayers';

export interface AeronauticalLayerControlProps {
  dataset: AeronauticalDatasetRef | null;
  status: AeronauticalLoadStatus;
  visibility: AeronauticalLayerVisibility;
  onVisibilityChange: (
    layerId: AeronauticalLayerId,
    visible: boolean,
  ) => void;
}

function datasetLabel(dataset: AeronauticalDatasetRef | null): string {
  if (dataset === null) {
    return 'No aeronautical dataset configured';
  }

  return `${dataset.sourceName}${
    dataset.airacCycle === null ? '' : ` · AIRAC ${dataset.airacCycle}`
  }`;
}

export function AeronauticalLayerControl({
  dataset,
  status,
  visibility,
  onVisibilityChange,
}: AeronauticalLayerControlProps) {
  return (
    <fieldset className="aeronautical-layer-control">
      <legend>Aeronautical layers</legend>
      {AERONAUTICAL_LAYER_DEFINITIONS.map((definition) => (
        <label key={definition.id}>
          <input
            type="checkbox"
            checked={visibility[definition.id]}
            onChange={(event) =>
              onVisibilityChange(
                definition.id,
                event.currentTarget.checked,
              )
            }
          />
          <span>{definition.label}</span>
          <small>z{definition.minimumZoom}+</small>
        </label>
      ))}
      <p
        className={status === 'error' ? 'aeronautical-layer-control__error' : ''}
        role="status"
      >
        {status === 'error'
          ? 'Aeronautical data unavailable'
          : datasetLabel(dataset)}
      </p>
    </fieldset>
  );
}

