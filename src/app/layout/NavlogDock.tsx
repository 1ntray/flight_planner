import { NavigationLog } from '../navigation/NavigationLog';
import type { NavigationLogProps } from '../navigation/NavigationLog';

export interface NavlogDockProps {
  waypointCount: number;
  navigationLogProps: Omit<NavigationLogProps, 'section'>;
}

export function NavlogDock({
  waypointCount,
  navigationLogProps,
}: NavlogDockProps) {
  return (
    <section className="navlog-dock" aria-labelledby="navlog-heading">
      <div className="navlog-dock__header">
        <div>
          <p className="eyebrow">Route</p>
          <h2 id="navlog-heading">Navigation log</h2>
        </div>
        <span className="waypoint-count">
          {waypointCount} {waypointCount === 1 ? 'waypoint' : 'waypoints'}
        </span>
      </div>
      <div className="navlog-dock__content">
        <NavigationLog section="tables" {...navigationLogProps} />
      </div>
    </section>
  );
}
