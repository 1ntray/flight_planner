import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export interface CollapsibleSectionProps {
  title: string;
  summary?: string;
  hasIssue?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** Local presentation state for a compact planning sidebar. */
export function CollapsibleSection({
  title,
  summary,
  hasIssue = false,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (hasIssue) {
      setOpen(true);
    }
  }, [hasIssue]);

  return (
    <section
      className={`collapsible-section${hasIssue ? ' collapsible-section--issue' : ''}`}
    >
      <button
        type="button"
        className="collapsible-section__summary"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="collapsible-section__chevron" aria-hidden="true">
          {open ? '⌄' : '›'}
        </span>
        <span className="collapsible-section__title">{title}</span>
        {summary === undefined ? null : (
          <span className="collapsible-section__detail">{summary}</span>
        )}
        {hasIssue ? <span className="collapsible-section__issue">Needs attention</span> : null}
      </button>
      {open ? <div className="collapsible-section__content">{children}</div> : null}
    </section>
  );
}
