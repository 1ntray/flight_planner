# Z242L AFM digitization handoff

This package contains the reviewed numeric representation used to hand the AFM
nomograms to Codex without asking it to interpret the source images.

Files:
- `z242_afm_digitization_v1.json`: numeric chart geometry and validation cases.
- `codex_z242_afm_digitization_prompt.md`: implementation prompt.

The model is not a polynomial fit. It reproduces the two-panel nomogram in a
digitized coordinate system:
temperature -> pressure-altitude interpolation -> entry Y -> weight-panel guide
interpolation -> final Y -> distance.

Representative interior points for both Figure 5-10 and Figure 5-26 were
manually checked against the source graphs and found to agree closely. The
acceptance tests use a +/-10 m graph-reading tolerance.

Important safety boundary:
the small portions of the printed weight panel above/below the outer digitized
guide anchors use linear continuation of the nearest two guide slopes, but only
inside the published chart frame. Inputs or outputs outside the printed chart
bounds must fail closed.
