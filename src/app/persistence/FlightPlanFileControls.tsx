import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

import type { FlightPlanningDocument } from '../../domain';
import {
  parseFlightPlanningDocumentJson,
  serializeFlightPlanningDocument,
} from '../../persistence';

export interface FlightPlanFileControlsProps {
  document: FlightPlanningDocument | null;
  localDraftStatus: LocalDraftStatus;
  onImport: (document: FlightPlanningDocument) => void;
  onNewPlan: () => void;
}

export interface LocalDraftStatus {
  kind: 'neutral' | 'success' | 'error';
  message: string;
}

type FileStatus =
  | { kind: 'idle' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

interface ExportLink {
  document: FlightPlanningDocument;
  href: string;
  filename: string;
}

function createExportFilename(departureTimeUtcMs: number): string {
  const departure = new Date(departureTimeUtcMs)
    .toISOString()
    .replace(/:\d{2}\.\d{3}Z$/u, 'Z')
    .replaceAll(':', '-');

  return `flight-plan-${departure}.json`;
}

export function FlightPlanFileControls({
  document: planningDocument,
  localDraftStatus,
  onImport,
  onNewPlan,
}: FlightPlanFileControlsProps) {
  const [status, setStatus] = useState<FileStatus>({ kind: 'idle' });
  const [exportLink, setExportLink] = useState<ExportLink | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (planningDocument === null) {
      setExportLink(null);
      return undefined;
    }

    const serialized = serializeFlightPlanningDocument(planningDocument);
    const objectUrl = URL.createObjectURL(
      new Blob([serialized], { type: 'application/json' }),
    );

    setExportLink({
      document: planningDocument,
      href: objectUrl,
      filename: createExportFilename(
        planningDocument.planningInputs.departureTimeUtcMs,
      ),
    });

    return () => URL.revokeObjectURL(objectUrl);
  }, [planningDocument]);
  const currentExportLink =
    exportLink?.document === planningDocument ? exportLink : null;

  const importPlan = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (file === undefined) {
      return;
    }

    try {
      const importedDocument = parseFlightPlanningDocumentJson(
        await file.text(),
      );
      onImport(importedDocument);
      setStatus({
        kind: 'success',
        message: `Loaded ${file.name}.`,
      });
    } catch (error) {
      setStatus({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Flight plan could not be imported.',
      });
    } finally {
      input.value = '';
    }
  };

  const confirmNewPlan = () => {
    if (
      window.confirm(
        'Start a new plan? The current route, planning inputs, and local working draft will be cleared.',
      )
    ) {
      onNewPlan();
      setStatus({ kind: 'idle' });
    }
  };

  return (
    <section className="plan-file-controls" aria-label="Flight plan file">
      <div>
        <p className="eyebrow">Plan file</p>
        <p className="plan-file-controls__description">
          Versioned JSON inputs only; calculations and fetched weather are
          regenerated.
        </p>
      </div>
      <div className="plan-file-controls__actions">
        {currentExportLink === null ? (
          <button type="button" className="button" disabled>
            Export plan
          </button>
        ) : (
          <a
            className="button"
            href={currentExportLink.href}
            download={currentExportLink.filename}
            onClick={() =>
              setStatus({
                kind: 'success',
                message: 'Flight plan exported.',
              })
            }
          >
            Export plan
          </a>
        )}
        <button
          type="button"
          className="button"
          onClick={() => fileInputRef.current?.click()}
        >
          Import plan
        </button>
        <button
          type="button"
          className="button button--danger"
          onClick={confirmNewPlan}
        >
          New plan
        </button>
        <input
          ref={fileInputRef}
          className="plan-file-controls__file-input"
          type="file"
          accept="application/json,.json"
          aria-label="Choose flight plan JSON file"
          onChange={(event) => void importPlan(event)}
        />
      </div>
      <p
        className={
          localDraftStatus.kind === 'error'
            ? 'plan-file-controls__error'
            : 'plan-file-controls__status'
        }
        role={localDraftStatus.kind === 'error' ? 'alert' : 'status'}
      >
        Local draft: {localDraftStatus.message}
      </p>
      {status.kind === 'error' ? (
        <p className="plan-file-controls__error" role="alert">
          {status.message}
        </p>
      ) : planningDocument === null ? (
        <p className="plan-file-controls__error">
          Correct the planning inputs before exporting.
        </p>
      ) : status.kind === 'idle' ? null : (
        <p className="plan-file-controls__status" role="status">
          {status.message}
        </p>
      )}
    </section>
  );
}
