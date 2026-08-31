# Map rendering notes

## Base maps

The Leaflet map remains in its default EPSG:3857 Web Mercator CRS. Users may
choose between two mutually exclusive presentation-only base maps:

- Kartverket Norgeskart topo, served as cached 256 px Web Mercator tiles.
- Avinor Norway VFR Aeronautical Chart ICAO 1:500 000, served by the public
  `ICAO_500000_ExB/MapServer` as dynamically rendered Web Mercator tiles.

The Avinor source raster is published in a custom WGS 84 Lambert Conformal
Conic CRS. The ArcGIS export request specifies `bboxSR=3857` and
`imageSR=3857`, so ArcGIS performs the raster reprojection on the server. The
browser does not manually warp the chart and the application does not change
the Leaflet CRS.

The Avinor service currently allows the ArcGIS Experience origin, but not
localhost, to read cross-origin JSON. The layer therefore uses direct ArcGIS
`f=image` responses without attempting to read the PNG through JavaScript or a
canvas. Its attribution and usage warning are configured locally because the
public MapServer's copyright metadata is empty.

The application divides the Web Mercator map into stable 256 px XYZ cells and
requests each corresponding ArcGIS export at 1024 × 1024 px and 384 DPI. The
browser displays each response at 256 × 256 CSS px, providing 4× raster density.
Tiles load independently and in parallel; panning keeps nearby tiles and only
requests newly exposed cells instead of redrawing the complete viewport.

A narrowly scoped service worker caches successful Avinor tile responses in the
browser's Cache Storage. Cache keys include the published effective date, old
edition caches are removed when a new edition is first requested, and the
current cache is bounded to 160 tiles. The worker does not cache application
files, route data, or any non-Avinor requests. Because Avinor does not grant
localhost CORS access, the cross-origin PNG responses are opaque to application
JavaScript but can still be safely stored and returned to their original image
requests.

Selecting the Avinor chart requires a one-session acknowledgement of its
published terms. The acknowledgement and selected base map are not persisted.
The chart remains an aid to planning only; current AIP and NOTAM must still be
consulted and it must not be used as the sole navigation tool.

Base-map selection changes only the imagery below the existing layers. Route,
waypoint, aeronautical overlay, magnetic, wind, and performance values remain
WGS84 domain data and calculations.

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
