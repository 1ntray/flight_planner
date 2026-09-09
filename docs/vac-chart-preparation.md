# VAC chart preparation

VAC charts are presentation-only material. They do not supply waypoint
coordinates, route geometry, distances, tracks, airspace, or reporting-point
data. The browser never downloads or renders source PDFs and never contacts
Avinor for VAC content at runtime.

The offline flow is:

```text
reviewed Avinor VAC PDF + exact SHA-256
  -> high-resolution Poppler render
  -> reviewed, published WGS84 control points
  -> independent holdout validation
  -> one-time GDAL warp to EPSG:3857
  -> static XYZ PNG tiles + normalized manifest + review report
  -> AeronauticalDataRepository
  -> optional Leaflet overlay
```

## Production gate

A production manifest must contain an exact source PDF SHA-256, at least four
fit points, at least two separate validation points, residuals in metres and
pixels, declared quality thresholds, WGS84 bounds, local XYZ tile identity,
and traceable source references. Runtime validation is fail-closed: an
incomplete manifest or a chart whose measured error exceeds its thresholds is
not rendered.

The proof-of-concept config also requires the fit points to span at least 40%
of the cropped chart in both pixel dimensions. This is a simple distribution
guard, not a substitute for human review of the point layout.

The current proof of concept is Avinor **AD 2 ENDU 6-1**, chart date 14 May
2026. Its configuration uses eight distributed fit points and nine disjoint
holdout points. Each point matches a coordinate printed in the chart's
reporting-point table to the centre of the corresponding vector triangle.
The second-order polynomial transform produced an independent RMS error of
0.6 m and maximum error of 1.0 m, below the conservative production limits of
100 m RMS and 200 m maximum. The checked-in preparation report contains every
holdout residual. The current preparation revision renders the vector PDF at
1200 DPI and publishes native XYZ tiles through zoom 13 (1,989 PNG tiles,
32,247,301 bytes). Leaflet may overzoom those native tiles beyond zoom 13.

This numerical result verifies the reviewed control-point mapping and fitted
chart transformation. It does not make the chart current operational
information and does not replace visual comparison against the source chart.

## Local preparation

Prerequisites:

- Node.js and the repository's pnpm version;
- Poppler with `pdftoppm` on `PATH`;
- GDAL 3.11 or newer with `gdal_translate`, `gdalwarp`, `gdaltransform`,
  `gdalinfo`, and `gdal raster tile` on `PATH`.

Prepare and validate ENDU without activating it:

```sh
pnpm aero:prepare:vac -- --icao ENDU
```

After reviewing the generated report, activate the validated manifest in the
approved local dataset:

```sh
pnpm aero:prepare:vac -- --icao ENDU --activate
```

For reproducible offline work, an already downloaded PDF can be supplied:

```sh
pnpm aero:prepare:vac -- --icao ENDU --source-pdf path/to/ENDU-VAC.pdf --activate
```

The local bytes must match the configured SHA-256. A mismatch, missing tool,
malformed config, failed transformation, or quality-gate failure aborts before
publishing a manifest or activating data. Prepared tile paths include the
chart date, source-hash prefix, and a reviewed `preparationRevision`. Source,
resolution, georeferencing, or tiling changes therefore produce separate
candidate assets rather than silently overwriting an approved chart. Re-running
an unchanged preparation is idempotent; different output at an existing
identity fails instead of overwriting it.

Generated outputs are stored under:

- `public/aeronautical/vac/` for static EPSG:3857 XYZ tiles;
- `data/aeronautical/vac/` for the manifest and JSON/Markdown review report;
- `src/aeronautical/data/` only when `--activate` updates the approved
  repository dataset.

Source PDFs and intermediate renders/GeoTIFFs are not committed. The manifest
retains the source URL, hash, chart date, eAIP reference, fit control points,
validation summary, bounds, zoom range, and preparation-report reference.

## AIRAC relationship

VAC preparation is deliberately separate from normal eAIP AIRAC discovery.
The AIRAC updater carries an approved VAC manifest forward unchanged, including
its original chart date, source hash, and source references. A newly discovered
eAIP edition never relabels, rewarps, or silently replaces VAC assets. Updating
a VAC requires a new reviewed preparation configuration and source identity.

## Adding another aerodrome

Add a reviewed configuration under `tools/aeronautical/vac/prepared/` and
register it in the CLI. Fit points must cover the chart frame and validation
points must be independent. Coordinates absent from the source must not be
guessed. A chart without enough reliable source control remains unavailable.
The same pipeline and gate apply before its manifest can enter the repository.
