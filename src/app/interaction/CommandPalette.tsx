import { useEffect, useMemo, useRef, useState } from 'react';

export interface CommandPaletteCommand {
  id: string;
  label: string;
  shortcut?: string;
}

export interface CommandPaletteProps {
  commands: readonly CommandPaletteCommand[];
  onRun: (id: string) => void;
  onClose: () => void;
}

export function CommandPalette({
  commands,
  onRun,
  onClose,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(
    () =>
      commands.filter((command) =>
        command.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
      ),
    [commands, query],
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const runFirst = () => {
    const command = filtered[0];
    if (command !== undefined) {
      onRun(command.id);
    }
  };

  return (
    <div className="command-palette-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="search"
          placeholder="Find an action…"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            } else if (event.key === 'Enter') {
              event.preventDefault();
              runFirst();
            }
          }}
        />
        <div className="command-palette__results">
          {filtered.map((command) => (
            <button
              key={command.id}
              type="button"
              onClick={() => onRun(command.id)}
            >
              <span>{command.label}</span>
              {command.shortcut === undefined ? null : <kbd>{command.shortcut}</kbd>}
            </button>
          ))}
          {filtered.length === 0 ? (
            <p>No matching action.</p>
          ) : null}
        </div>
        <p>Enter: run first result · Esc: close</p>
      </section>
    </div>
  );
}
