import type { FlightPlanningDocument } from '../../domain';
import { ShortcutReference } from '../interaction/ShortcutReference';
import { NavigationLog } from '../navigation/NavigationLog';
import type { NavigationLogProps } from '../navigation/NavigationLog';
import { FlightPlanFileControls } from '../persistence/FlightPlanFileControls';
import type { LocalDraftStatus } from '../persistence/FlightPlanFileControls';

export type PlannerSidebarTab = 'planning' | 'shortcuts';

export interface PlannerSidebarProps {
  activeTab: PlannerSidebarTab;
  waypointCount: number;
  shapingPointCount: number;
  planningDocument: FlightPlanningDocument | null;
  localDraftStatus: LocalDraftStatus;
  navigationLogProps: Omit<NavigationLogProps, 'section'>;
  onActiveTabChange: (tab: PlannerSidebarTab) => void;
  onClearRoute: () => void;
  onImport: (document: FlightPlanningDocument) => void;
  onNewPlan: () => void;
}

export function PlannerSidebar({
  activeTab,
  waypointCount,
  shapingPointCount,
  planningDocument,
  localDraftStatus,
  navigationLogProps,
  onActiveTabChange,
  onClearRoute,
  onImport,
  onNewPlan,
}: PlannerSidebarProps) {
  return (
    <aside className="route-panel" aria-labelledby="planning-heading">
      <div className="route-panel__header">
        <div>
          <p className="eyebrow">Planner</p>
          <h2 id="planning-heading">Flight setup</h2>
        </div>
        <span className="waypoint-count">
          {waypointCount} {waypointCount === 1 ? 'waypoint' : 'waypoints'}
          {shapingPointCount === 0
            ? ''
            : ` · ${shapingPointCount} ${shapingPointCount === 1 ? 'shaping point' : 'shaping points'}`}
        </span>
      </div>

      <div className="sidebar-tabs" role="tablist" aria-label="Planner panels">
        <button
          type="button"
          role="tab"
          id="planning-tab"
          aria-selected={activeTab === 'planning'}
          aria-controls="planning-panel"
          className={activeTab === 'planning' ? 'sidebar-tabs__tab sidebar-tabs__tab--active' : 'sidebar-tabs__tab'}
          onClick={() => onActiveTabChange('planning')}
        >
          Planning
        </button>
        <button
          type="button"
          role="tab"
          id="shortcuts-tab"
          aria-selected={activeTab === 'shortcuts'}
          aria-controls="shortcuts-panel"
          aria-keyshortcuts="?"
          className={activeTab === 'shortcuts' ? 'sidebar-tabs__tab sidebar-tabs__tab--active' : 'sidebar-tabs__tab'}
          onClick={() => onActiveTabChange('shortcuts')}
        >
          Shortcuts <kbd>?</kbd>
        </button>
      </div>

      <div className="route-panel__content">
        {activeTab === 'planning' ? (
          <div id="planning-panel" role="tabpanel" aria-labelledby="planning-tab">
            <div className="planning-actions">
              <button
                type="button"
                className="button"
                disabled={waypointCount === 0}
                onClick={onClearRoute}
              >
                Clear route
              </button>
            </div>

            <FlightPlanFileControls
              document={planningDocument}
              localDraftStatus={localDraftStatus}
              onImport={onImport}
              onNewPlan={onNewPlan}
            />

            <NavigationLog section="controls" {...navigationLogProps} />
          </div>
        ) : (
          <div id="shortcuts-panel" role="tabpanel" aria-labelledby="shortcuts-tab">
            <ShortcutReference />
          </div>
        )}
      </div>
    </aside>
  );
}
