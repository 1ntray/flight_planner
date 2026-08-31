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
 * Returns one Leaflet `panBy` offset that places a rendered popup fully inside
 * the map and outside every protected control rectangle. Leaflet's own popup
 * auto-pan is deliberately disabled by the caller: repeated popup updates can
 * otherwise form a moveend -> React render -> popup update feedback loop.
 */
export function calculatePopupCollisionPan(
  map: Rectangle,
  popup: Rectangle,
  protectedAreas: readonly Rectangle[],
): MapPanOffset | null {
  const innerMap = {
    top: map.top + MAP_EDGE_GAP_PX,
    right: map.right - MAP_EDGE_GAP_PX,
    bottom: map.bottom - MAP_EDGE_GAP_PX,
    left: map.left + MAP_EDGE_GAP_PX,
  };
  const popupWidth = popup.right - popup.left;
  const popupHeight = popup.bottom - popup.top;

  // A pan cannot make an oversized popup fit. Returning no movement is safer
  // than repeatedly alternating which edge is outside the map.
  if (
    popupWidth > innerMap.right - innerMap.left ||
    popupHeight > innerMap.bottom - innerMap.top
  ) {
    return null;
  }

  const relevantAreas = protectedAreas.filter((area) =>
    rectanglesOverlap(map, area),
  );
  const xOffsets = new Set<number>([
    0,
    innerMap.left - popup.left,
    innerMap.right - popup.right,
  ]);
  const yOffsets = new Set<number>([
    0,
    innerMap.top - popup.top,
    innerMap.bottom - popup.bottom,
  ]);

  for (const area of relevantAreas) {
    xOffsets.add(area.left - popup.right - MAP_EDGE_GAP_PX);
    xOffsets.add(area.right - popup.left + MAP_EDGE_GAP_PX);
    yOffsets.add(area.top - popup.bottom - MAP_EDGE_GAP_PX);
    yOffsets.add(area.bottom - popup.top + MAP_EDGE_GAP_PX);
  }

  const candidates = [...xOffsets]
    .flatMap((x) => [...yOffsets].map((y) => ({ x, y })))
    .filter(({ x, y }) => {
      const movedPopup = translateRectangle(popup, x, y);
      return (
        movedPopup.left >= innerMap.left &&
        movedPopup.right <= innerMap.right &&
        movedPopup.top >= innerMap.top &&
        movedPopup.bottom <= innerMap.bottom &&
        relevantAreas.every((area) => !rectanglesOverlap(movedPopup, area))
      );
    });
  const candidate = candidates.sort(
    (first, second) =>
      Math.abs(first.x) + Math.abs(first.y) -
      (Math.abs(second.x) + Math.abs(second.y)),
  )[0];

  if (candidate === undefined || (candidate.x === 0 && candidate.y === 0)) {
    return null;
  }

  return {
    x: candidate.x === 0 ? 0 : -candidate.x,
    y: candidate.y === 0 ? 0 : -candidate.y,
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
