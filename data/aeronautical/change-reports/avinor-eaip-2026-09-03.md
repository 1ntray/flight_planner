# AIRAC update: 2026-06-11-AIRAC → 2026-09-03-AIRAC

| Dataset concept | Before | Candidate |
| --- | ---: | ---: |
| Aerodromes | 53 | 53 |
| Airspace volumes | 206 | 206 |
| CTR / TIZ | 52 | 52 |
| TMA | 96 | 96 |
| TIA | 20 | 20 |
| CTA | 38 | 38 |
| ATS service areas | 38 | 37 |
| ATS units | 19 | 19 |
| Communication services | 223 | 219 |
| Frequency assignments | 487 | 477 |
| Reporting points | 218 | 218 |
| VAC chart manifests | 0 | 0 |

## Notable semantic changes

- ATS service area removed: ats-service-area:enr22:polaris-acc-sector-8:gnd-to-unl:585535n-0073000e-585755n-0090323e
- Aerodrome runway/declared distances changed: aerodrome:ENTO
- Communication service removed: communication:ad2:eneg:app:118-480
- Communication service removed: communication:ad2:eneg:app:120-455
- Communication service removed: communication:ad2:eneg:radio
- Communication service removed: communication:enr22:polaris-acc-sector-8:area-control
- Frequency assignments changed: communication:ad2:enhf:afis
- Frequency assignments changed: communication:ad2:enov:afis
- Frequency assignments changed: communication:enr21:polaris-cta:area-control:polaris-control

## Importer

- Errors: 0
- eAIP warnings: 1
- Carried/prepared VAC reporting-point warnings: 30
- Reviewed VAC-derived reporting points and VAC manifests were carried forward unchanged with their original provenance; this workflow did not update VAC assets.

## Verification

- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`

> Merging this pull request is the human approval boundary. Discovery alone never activates the candidate dataset.
