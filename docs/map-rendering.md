# Map rendering notes

## Raster tile seam investigation

The Kartverket topo layer uses Leaflet's standard raster `TileLayer` with 256 px
tiles. The source imagery is not modified.

The application was audited for common causes of raster tile seams:

- Neither `.flight-map` nor any application ancestor applies CSS `transform`,
  `scale`, or `zoom`.
- The application does not override Leaflet tile dimensions or tile styles.
- `zoomSnap` and `zoomDelta` are not customized, so Leaflet's integer defaults
  of `1` apply.
- The Kartverket source does not enable retina remapping, custom `tileSize`, or
  zoom offsets.
- Borders and `overflow: hidden` are applied only to the outer map panel and do
  not change the tile grid.

At 175% Windows display scaling, browser inspection measured the map container
at fractional CSS dimensions while each rendered tile remained exactly
256 × 256 CSS px and used integer 256 px translations relative to its Leaflet
tile pane. Fractional absolute tile edges are therefore introduced by browser
device-pixel rasterization, not by a scaled tile grid or the source images.

This matches the known Leaflet/browser subpixel tile-gap rendering issue tracked
in [Leaflet issue #3575](https://github.com/Leaflet/Leaflet/issues/3575). Leaflet
1.9.4 already includes its Chromium mitigation using `mix-blend-mode` on raster
tile images, as recorded in the
[Leaflet 1.9.4 release notes](https://github.com/Leaflet/Leaflet/releases/tag/v1.9.4).

Chrome/Chromium testing confirmed that thin seams can remain visible despite
Leaflet's mitigation, while Firefox renders the same tile boundary correctly.
The application therefore applies one isolated fallback: Chromium-based user
agents add `kartverket-topo-tiles--chromium-seam-fix` to this tile layer, and its
tiles overlap by 0.5 CSS px. This is the smallest practical overlap that covers
the compositing gap without changing tile coordinates or source imagery.
Within that scoped class, `mix-blend-mode` is reset to `normal`; Leaflet's
`plus-lighter` mitigation would otherwise brighten the intentionally overlapped
edge and make the tile grid visible.

Firefox and Safari do not receive the class, so their standard Leaflet tile
dimensions remain unchanged. The workaround is contained in
`rasterTileSeamWorkaround.ts` and `rasterTileSeamWorkaround.css`; it does not
patch Leaflet globals or private `GridLayer` behavior.

## Marker dragging

`FlightPlan` remains canonical route state. Its waypoint array defines real
navlog points; its leg shapes define ordered intermediate route geometry. While
a real or shaping marker is being dragged, `FlightMap` stores only that marker's
temporary WGS84 latitude and longitude. Marker and polyline display positions
substitute this temporary value until `dragend`, when the final position is
committed and the temporary value is cleared.

Each displayed real-waypoint leg has a normal visible polyline and wider,
nearly transparent interactive segment overlays. Pressing and dragging a
segment creates a presentation-only shaping-point draft at that segment's
insertion index. Map panning is disabled for the gesture. On pointer release,
the draft is committed once to the matching `LegShape`; background map clicks
remain reserved for creating real waypoints.

Temporary positions are presentation state only. Calculated navigation legs
remain derived from the canonical `FlightPlan` through the WGS84 geodesy layer;
Leaflet pixel coordinates and Web Mercator coordinates are never used for
distance or true-track calculations.
