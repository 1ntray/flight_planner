# Avinor AIRAC update workflow

## Approval model

The operational browser dataset is always selected explicitly by two checked-in
files:

- `tools/aeronautical/avinor-eaip/edition.ts` pins the reviewed Avinor edition
  and its exact AD 1.3, ENR 2.1, and ENR 2.2 URLs;
- `src/aeronautical/avinorRepository.ts` imports the corresponding versioned
  normalized JSON file.

Discovery never changes either file by itself. A newer publication becomes the
default only when a human reviews and merges the generated pull request. This
is the approval boundary even if the new edition has already become effective.

The browser does not run discovery, parse eAIP HTML, or contact Avinor. Saved
flight plans continue to hold coordinate and compact provenance snapshots, so
an approved repository update cannot silently move an existing route.

At the current main revision, the approved selectors point to
`avinor-eaip-2026-09-03`, effective 3 September 2026 (AIP AMDT 05/2026). The
versioned dataset and its import/change reports are review artefacts for that
specific approval, not live data retrieved by the browser.

## Local commands

### One-click Windows tool

Double-click `update-airac.cmd` in the project folder. The guided tool checks
for a newer edition, asks before writing, imports and validates the complete
candidate, runs the TypeScript compiler, all tests, and the production build,
and opens the generated Markdown change report in Notepad.

It calls the checked-in Node tools directly, so it does not require entering
pnpm commands manually. It never commits, pushes, opens a pull request, or
merges anything. The local candidate remains subject to the same human review
as an automated update pull request.

### Command line

Check Avinor's publication history without changing repository files:

```sh
pnpm aero:check-update
```

Discover, import, validate, compare, and prepare a newer edition locally:

```sh
pnpm aero:validate-update
pnpm aero:update
```

`aero:validate-update` performs the full candidate retrieval, import, and
validation in memory without writing repository files. It is useful for
diagnosing an update before preparing it.

`aero:update` exits successfully without writing when the pin is already
current. When an update exists, it writes a versioned dataset, import report,
and Markdown change report, then updates the two checked-in selectors. Treat
that result exactly like the automation pull request: inspect all warnings,
semantic changes, and suspicious absences before committing or merging it.

`pnpm aero:import` remains the lower-level command for regenerating the exact
currently pinned edition. It never discovers or activates a different edition.

## Discovery and failure behavior

Edition discovery is a small Node-only layer separate from the importer. It
reads Avinor's public eAIP publication-history page and recognizes semantic
current/next issue headings and their effective-date, publication-date, and
reason columns. It validates the visible effective date against the dated issue
URL. It does not use generated DOM IDs and does not infer an AIRAC cycle number
when Avinor has not published one.

Missing tables, multiple candidate rows, inconsistent dates, cross-origin or
unrecognized issue links, retrieval failures, partial aerodrome imports,
importer errors, mismatched provenance, duplicate core feature identities, and
invalid normalized structures fail visibly. Candidate files and selectors are
not written until the in-memory import passes these checks. A failed automation
run therefore leaves the approved branch and dataset unchanged; its Actions log
contains the discovery/import error for diagnosis.

VAC chart assets and VAC-derived reporting points are a separate review stream.
The eAIP updater carries the currently approved versions forward unchanged with
their original feature provenance and records this explicitly in the import and
change reports. It does not relabel them as belonging to the new eAIP edition.

## Change report

Each candidate gets
`data/aeronautical/change-reports/<candidate-dataset-id>.md`. The report compares
the approved and candidate normalized datasets using the stable identities
already produced by the importer. It includes counts and additions, removals,
or changes for aerodromes, runway/declared-distance data, airspace and vertical
limits, ATS structures, communication/frequency assignments, reporting points,
and VAC manifests. Point movement is measured with the existing WGS84 inverse
geodesic calculation and reported in metres.

The report is concise and is also used as the pull-request body. It is a review
aid, not a substitute for checking the source eAIP, complete import report, and
generated diff.

## GitHub Actions

`.github/workflows/airac-update.yml` runs on manual dispatch and once each week.
It installs the pinned pnpm version on Node.js 24, runs `pnpm aero:update`, and
stops successfully when no update exists. For a candidate it runs:

```sh
pnpm typecheck
pnpm test
pnpm build
```

Only after all checks pass does it create or update the dedicated
`codex/avinor-airac-update` pull-request branch. Repeated checks reuse that
branch and pull request rather than creating duplicates. The workflow neither
pushes to `main` nor enables auto-merge.

In GitHub, enable **Settings → Actions → General → Workflow permissions → Allow
GitHub Actions to create and approve pull requests**. The workflow itself asks
only for `contents: write` and `pull-requests: write`; ensure an organization
policy does not prohibit those scopes. Branch protection or rulesets should
still require the desired human approval and status checks before merge.

## Manual aviation-data review

Before merging, a reviewer should at minimum verify the discovered effective
date and revision against Avinor, inspect all importer errors and warnings,
review count reductions and additions/removals, spot-check changed coordinates,
vertical limits, runway/declared distances, and frequencies, and confirm that
carried-forward VAC/reporting-point material is still appropriate. An
unexpectedly quiet semantic diff also deserves review because source-format
changes can sometimes preserve counts while losing meaning.
