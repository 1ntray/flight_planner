import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import type { Waypoint } from '../../domain';
import { MAX_WAYPOINT_NAME_LENGTH } from './waypointState';

export interface WaypointEditorProps {
  waypoint: Waypoint;
  nameFocusRequest: number;
  onRename: (id: string, name: string) => void;
}

function getNameValidationMessage(name: string): string | null {
  const normalizedName = name.trim();

  if (normalizedName === '') {
    return 'Enter a waypoint name.';
  }

  if (normalizedName.length > MAX_WAYPOINT_NAME_LENGTH) {
    return `Use ${MAX_WAYPOINT_NAME_LENGTH} characters or fewer.`;
  }

  return null;
}

export function WaypointEditor({
  waypoint,
  nameFocusRequest,
  onRename,
}: WaypointEditorProps) {
  const [draftName, setDraftName] = useState(waypoint.name);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const handledNameFocusRequestRef = useRef(nameFocusRequest);

  useEffect(() => {
    setDraftName(waypoint.name);
  }, [waypoint.id, waypoint.name]);

  useEffect(() => {
    if (nameFocusRequest <= handledNameFocusRequestRef.current) {
      return;
    }

    handledNameFocusRequestRef.current = nameFocusRequest;
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, [nameFocusRequest]);

  const normalizedName = draftName.trim();
  const validationMessage = getNameValidationMessage(draftName);
  const hasChanged = normalizedName !== waypoint.name;
  const submitRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (validationMessage === null && hasChanged) {
      onRename(waypoint.id, normalizedName);
    }
  };

  return (
    <form className="waypoint-editor" onSubmit={submitRename}>
      <div className="waypoint-editor__heading">
        <div>
          <p className="eyebrow">Selected waypoint</p>
          <h3>{waypoint.name}</h3>
        </div>
        <span className="waypoint-editor__kind">
          {waypoint.anchor === undefined ? 'Free' : 'Anchored'}
        </span>
      </div>

      <label htmlFor="selected-waypoint-name">Navlog name</label>
      <div className="waypoint-editor__name-control">
        <input
          ref={nameInputRef}
          id="selected-waypoint-name"
          type="text"
          aria-keyshortcuts="N"
          value={draftName}
          maxLength={MAX_WAYPOINT_NAME_LENGTH}
          aria-invalid={validationMessage !== null}
          aria-describedby="selected-waypoint-name-help"
          onChange={(event) => setDraftName(event.target.value)}
        />
        <button
          type="submit"
          className="button"
          disabled={validationMessage !== null || !hasChanged}
        >
          Save name
        </button>
      </div>

      <p
        id="selected-waypoint-name-help"
        className={
          validationMessage === null
            ? 'waypoint-editor__help'
            : 'waypoint-editor__error'
        }
        aria-live="polite"
      >
        {validationMessage ??
          (waypoint.anchor === undefined
            ? `Up to ${MAX_WAYPOINT_NAME_LENGTH} characters.`
            : `Coordinate locked to published ${waypoint.anchor.publishedIdentifier}; renaming preserves the anchor.`)}
      </p>
    </form>
  );
}
