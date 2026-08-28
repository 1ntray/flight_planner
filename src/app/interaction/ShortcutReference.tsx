import { PLANNER_SHORTCUTS } from './plannerShortcuts';

export function ShortcutReference() {
  return (
    <section className="shortcut-reference" aria-labelledby="shortcut-reference-heading">
      <div>
        <p className="eyebrow">Keyboard</p>
        <h3 id="shortcut-reference-heading">Shortcuts</h3>
      </div>
      <p className="shortcut-reference__intro">
        Shortcuts are paused while a text field, number field, or menu has
        keyboard focus.
      </p>
      <dl>
        {PLANNER_SHORTCUTS.map((shortcut) => (
          <div key={shortcut.keys}>
            <dt><kbd>{shortcut.keys}</kbd></dt>
            <dd>
              <strong>{shortcut.action}</strong>
              <span>{shortcut.availability}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
