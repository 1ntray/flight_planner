# VAC chart preparation

VAC charts are presentation-only material. They do not supply waypoint
coordinates, route geometry, distances, tracks, airspace, or reporting-point
data. The browser never downloads or renders source PDFs and never contacts
Avinor for VAC content at runtime.

The offline flow is:

```text
reviewed Avinor VAC PDF + exact SHA-256
  -> high-resolution Poppler render
  -> reviewed published WGS84 point controls or published chart graticule
  -> independent holdout validation
  -> one-time GDAL warp to EPSG:3857
  -> compact WebP image (or legacy XYZ tiles) + normalized manifest + review report
  -> AeronauticalDataRepository
  -> optional Leaflet overlay
```

## Production gate

A production manifest must contain an exact source PDF SHA-256, at least four
fit points, at least two separate validation points, residuals in metres and
pixels, declared quality thresholds, WGS84 bounds, an identified local raster
asset (image or XYZ tile template), and traceable source references. Runtime
validation is fail-closed: an incomplete manifest or a chart whose measured
error exceeds its thresholds is not rendered.

The proof-of-concept config also requires the fit points to span at least 40%
of the cropped chart in both pixel dimensions. This is a simple distribution
guard, not a substitute for human review of the point layout.

The reviewed set currently contains 42 charts for 41 aerodromes: ENAL, ENAN,
ENAT, ENBL, ENBO, ENBR (two charts), ENBS, ENBV, ENCN, ENDU, ENEV, ENFL, ENGK,
ENGM, ENHD, ENHF, ENHK, ENHV, ENKB, ENKR, ENLK, ENMH, ENML, ENNA, ENNM, ENOV,
ENRE, ENRM, ENRO, ENRS, ENSD, ENSG, ENSH, ENSK, ENSO, ENSS, ENST, ENTC, ENVA,
ENVD and ENZV. The checked-in source edition is the Avinor eAIP Index/155
edition effective 3 September 2026; each chart retains its own published chart
date. Charts with no reliable published control points, or that fail the
independent quality gate, remain unavailable rather than being georeferenced
by guesswork.

ENRA is currently excluded because its candidate georeferencing failed the
declared residual limits. ENNO is excluded because its chart does not expose a
complete machine-readable labelled graticule. The older checked-in source
references for ENBN, ENMS and ENSR no longer resolve and must be refreshed from
an authoritative edition before preparation. These exclusions are explicit;
the preparation pipeline does not infer replacement source files or control
coordinates.

The current preparation revision renders each vector PDF at 1200 DPI, warps it
once to EPSG:3857, and publishes one quality-controlled WebP image per chart.
ENDU was migrated from the original XYZ proof-of-concept pyramid to this image
path so lower map zooms use the same full-resolution source. Legacy XYZ tile
manifests remain supported for future charts that genuinely need them.

Where a VAC has no reporting-point coordinate table, the offline extractor may
use its published latitude/longitude frame graticule. Longitude and latitude
are fitted independently from the labelled minute ticks; fixed quartile ticks
are held out before fitting and used by the normal validation gate. Generated
grid intersections are explicitly recorded as calculated from the published
graticule, never as published point coordinates. This allows ENAT, ENNA, ENLK,
ENSH and ENSK to be prepared without visually guessing geographic positions.

This numerical result verifies the reviewed control-point mapping and fitted
chart transformation. It does not make the chart current operational
information and does not replace visual comparison against the source chart.

## Local preparation

Prerequisites:

- Node.js and the repository's pnpm version;
- Poppler with `pdftoppm` on `PATH`;
- GDAL 3.11 or newer with `gdal_translate`, `gdalwarp`, `gdaltransform`, and
  `gdalinfo` on `PATH` (plus `gdal raster tile` when producing legacy XYZ
  tiles);

Prepare and validate one reviewed chart without activating it:

```sh
pnpm aero:prepare:vac -- --icao ENAL --source-pdf path/to/ENAL-VAC.pdf
```

After reviewing the generated report, activate the validated manifest in the
approved local dataset:

```sh
pnpm aero:prepare:vac -- --icao ENAL --source-pdf path/to/ENAL-VAC.pdf --activate
```

The national review catalog can be prepared in one batch from downloaded PDFs.
Each file is named with its ICAO identifier followed by the configured source
filename (for example, `ENAL-623091.pdf` for the current ENAL source URL):

```sh
pnpm aero:prepare:vac -- --all-reviewed --source-directory path/to/vac-pdfs
```

After reviewing every generated report, activate the batch atomically:

```sh
pnpm aero:prepare:vac -- --all-reviewed --source-directory path/to/vac-pdfs --activate
```

If the validated assets are already prepared and only activation is needed:

```sh
pnpm aero:prepare:vac -- --all-reviewed --activate-prepared
```

One already-prepared chart can likewise be activated after review:

```sh
pnpm aero:prepare:vac -- --icao ENLK --activate-prepared
```

The original ENDU workflow remains available with `--icao ENDU` and its exact
downloaded source PDF.

The local bytes must match the configured SHA-256. A mismatch, missing tool,
malformed config, failed transformation, or quality-gate failure aborts before
publishing a manifest or activating data. Prepared asset paths include the
chart date, source-hash prefix, and a reviewed `preparationRevision`. Source,
resolution, georeferencing, or tiling changes therefore produce separate
candidate assets rather than silently overwriting an approved chart. Re-running
an unchanged preparation is idempotent; different output at an existing
identity fails instead of overwriting it.

Generated outputs are stored under:

- `public/aeronautical/vac/` for static EPSG:3857 WebP images (and legacy XYZ
  tiles);
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
register it in the CLI. Reporting-point controls are kept in
`national-vac-controls-2026-09-03.json`; reviewed graticule models are kept in
`graticule-vac-controls-2026-09-03.json`, with their factory in `national.ts`.
The offline `extractVacGraticule.py` helper can create a review candidate from
a vector VAC PDF but never publishes or activates it. Fit
points must cover the chart frame and validation points must be independent.
Coordinates absent from the source must not be guessed. A chart without enough
reliable source control remains unavailable. The same pipeline and gate apply
before its manifest can enter the repository.
