import { useState } from 'react';

import { buildOfpPdfModel, type BuildOfpPdfModelInput } from './buildOfpPdfModel';
import { generateOfpPdf, loadOfpTemplateBytes } from './generateOfpPdf';

export interface OfpExportButtonProps { readonly input: BuildOfpPdfModelInput; }

function filename(input: BuildOfpPdfModelInput): string {
  const safe = (value: string | undefined) => (value ?? 'ROUTE').replace(/[^A-Za-z0-9_-]+/g, '_');
  const date = input.departureTimeUtcMs === null ? new Date().toISOString().slice(0, 10) : new Date(input.departureTimeUtcMs).toISOString().slice(0, 10);
  return `OFP_${safe(input.flightPlan.waypoints[0]?.name)}_${safe(input.flightPlan.waypoints.at(-1)?.name)}_${date}.pdf`;
}

export function OfpExportButton({ input }: OfpExportButtonProps) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exportPdf = async () => {
    setWorking(true); setError(null);
    try {
      const bytes = await generateOfpPdf(buildOfpPdfModel(input), await loadOfpTemplateBytes());
      const pdfBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const url = URL.createObjectURL(new Blob([pdfBuffer], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url; link.download = filename(input); link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The OFP could not be generated.');
    } finally {
      setWorking(false);
    }
  };
  return <div className="ofp-export"><button type="button" className="secondary-button" onClick={() => void exportPdf()} disabled={working}>{working ? 'Generating OFP…' : 'Export OFP'}</button>{error === null ? null : <p className="ofp-export__error" role="alert">{error}</p>}</div>;
}
