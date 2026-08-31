export interface Rectangle {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface MapPopupAutoPanPadding {
  readonly topLeft: [number, number];
  readonly bottomRight: [number, number];
}

export interface MapPanOffset {
  readonly x: number;
  readonly y: number;
}

const MAP_EDGE_GAP_PX = 12;
const EDGE_ANCHORED_OVERLAY_THRESHOLD_PX = 48;

function rectanglesOverlap(first: Rectangle, second: Rectangle): boolean {
  return (
    first.left < second.right &&
    first.right > second.left &&
    first.top < second.bottom &&
    first.bottom > second.top
  );
}

function translateRectangle(
  rectangle: Rectangle,
  x: number,
  y: number,
): Rectangle {
  return {
    top: rectangle.top + y,
    right: rectangle.right + x,
    bottom: rectangle.bottom + y,
    left: rectangle.left + x,
  };
}

/**
 * Returns a Leaflet `panBy` offset that separates a rendered popup from map
 * controls. Leaflet's auto-pan padding protects only map edges, so it cannot
 * on its own represent an overlay panel that occupies the top-right corner.
 */
export function calculatePopupCollisionPan(
  map: Rectangle,
  popup: Rectangle,
  protectedAreas: readonly Rectangle[],
): MapPanOffset | null {
  let visualX = 0;
  let visualY = 0;

  // Moving for one panel can reveal an overlap with another, so resolve a
  // small bounded set of passes. The panels are static during a popup open.
  for (let pass = 0; pass < protectedAreas.length; pass += 1) {
    let moved = false;

    for (const area of protectedAreas) {
      const currentPopup = translateRectangle(popup, visualX, visualY);
      if (!rectanglesOverlap(currentPopup, area)) continue;

      const candidates = [
        { x: area.left - currentPopup.right - MAP_EDGE_GAP_PX, y: 0 },
        { x: area.right - currentPopup.left + MAP_EDGE_GAP_PX, y: 0 },
        { x: 0, y: area.top - currentPopup.bottom - MAP_EDGE_GAP_PX },
        { x: 0, y: area.bottom - currentPopup.top + MAP_EDGE_GAP_PX },
      ].filter(({ x, y }) => {
        const movedPopup = translateRectangle(currentPopup, x, y);
        return (
          movedPopup.left >= map.left + MAP_EDGE_GAP_PX &&
          movedPopup.right <= map.right - MAP_EDGE_GAP_PX &&
          movedPopup.top >= map.top + MAP_EDGE_GAP_PX &&
          movedPopup.bottom <= map.bottom - MAP_EDGE_GAP_PX &&
          !rectanglesOverlap(movedPopup, area)
        );
      });

      const candidate = candidates.sort(
        (first, second) =>
          Math.abs(first.x) + Math.abs(first.y) -
          (Math.abs(second.x) + Math.abs(second.y)),
      )[0];

      // If the popup cannot fit both inside the map and outside this control,
      // leave it where Leaflet placed it. An impossible corrective pan would
      // make Leaflet pan back on the next update and create a feedback loop.
      if (candidate === undefined) continue;

      visualX += candidate.x;
      visualY += candidate.y;
      moved = true;
    }

    if (!moved) break;
  }

  return visualX === 0 && visualY === 0
    ? null
    : {
        x: visualX === 0 ? 0 : -visualX,
        y: visualY === 0 ? 0 : -visualY,
      };
}

/**
 * Converts overlay-control rectangles into Leaflet popup auto-pan padding.
 *
 * Leaflet only accepts a protected inset rectangle, rather than arbitrary
 * exclusion rectangles. Top and bottom overlays therefore reserve a complete
 * horizontal band, while side overlays reserve their respective map edges.
 */
export function calculateMapPopupAutoPanPadding(
  map: Rectangle,
  protectedAreas: readonly Rectangle[],
): MapPopupAutoPanPadding {
  let top = MAP_EDGE_GAP_PX;
  let right = MAP_EDGE_GAP_PX;
  let bottom = MAP_EDGE_GAP_PX;
  let left = MAP_EDGE_GAP_PX;
  const horizontalMiddle = (map.left + map.right) / 2;

  for (const area of protectedAreas) {
    const intersectsMap =
      area.left < map.right &&
      area.right > map.left &&
      area.top < map.bottom &&
      area.bottom > map.top;
    if (!intersectsMap) continue;

    // Layer controls are anchored to the top of the map and can grow below
    // its midpoint. Their whole height must still remain protected.
    const isTopOverlay =
      area.top <= map.top + EDGE_ANCHORED_OVERLAY_THRESHOLD_PX;
    const isBottomOverlay =
      !isTopOverlay &&
      area.bottom >= map.bottom - EDGE_ANCHORED_OVERLAY_THRESHOLD_PX;

    if (isTopOverlay) {
      top = Math.max(top, area.bottom - map.top + MAP_EDGE_GAP_PX);
    } else if (isBottomOverlay) {
      bottom = Math.max(bottom, map.bottom - area.top + MAP_EDGE_GAP_PX);
    }

    // A top/bottom control is protected by its reserved horizontal band. Only
    // a control that occupies the map's middle height needs a side inset.
    if (isTopOverlay || isBottomOverlay) continue;

    const areaMiddleX = (area.left + area.right) / 2;
    if (areaMiddleX <= horizontalMiddle) {
      left = Math.max(left, area.right - map.left + MAP_EDGE_GAP_PX);
    } else {
      right = Math.max(right, map.right - area.left + MAP_EDGE_GAP_PX);
    }
  }

  return {
    topLeft: [left, top],
    bottomRight: [right, bottom],
  };
}
