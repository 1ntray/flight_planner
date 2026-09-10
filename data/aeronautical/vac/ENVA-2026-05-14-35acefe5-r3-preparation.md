# VAC preparation: vac:ENVA:2026-05-14

- Source: [623181.pdf](https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/graphics/623181.pdf)
- Source SHA-256: `35acefe5ed4a3f7cfec86cd260b7a23c87ee23be332b58768ed97ee606c1f9cd`
- Source file: `623181.pdf`, page 1
- Render: 1200 DPI
- Target CRS: EPSG:3857
- Transform: second-order polynomial (16 fit points; 8 independent holdouts)
- Independent validation: 8 points
- RMS: 4.0 m / 0.65 px
- Maximum: 7.4 m / 1.18 px
- Gate: RMS <= 100 m; maximum <= 200 m
- Result: **PASS**
- Bounds: 63.1765567, 10.2915489 to 63.7065317, 11.3604075
- Raster assets: 1 file(s), 2809576 bytes

- Raster output: `public/aeronautical/vac/enva/2026-05-14-35acefe5-r3/chart.webp`

## Fit control points

| Point | Pixel X | Pixel Y | Latitude | Longitude |
| --- | ---: | ---: | ---: | ---: |
| GRATICULE-GRID-1-1 | -0.33 | 0.12 | 63.677261 | 10.291507 |
| GRATICULE-GRID-1-2 | 2613.92 | 0.12 | 63.687017 | 10.626095 |
| GRATICULE-GRID-1-3 | 5228.18 | 0.12 | 63.696772 | 10.960939 |
| GRATICULE-GRID-1-4 | 7842.43 | 0.12 | 63.706527 | 11.296039 |
| GRATICULE-GRID-2-1 | -0.33 | 2937.42 | 63.510341 | 10.318754 |
| GRATICULE-GRID-2-2 | 2613.92 | 2937.42 | 63.520055 | 10.651419 |
| GRATICULE-GRID-2-3 | 5228.18 | 2937.42 | 63.529770 | 10.984339 |
| GRATICULE-GRID-2-4 | 7842.43 | 2937.42 | 63.539484 | 11.317516 |
| GRATICULE-GRID-3-1 | -0.33 | 5874.72 | 63.343430 | 10.346001 |
| GRATICULE-GRID-3-2 | 2613.92 | 5874.72 | 63.353103 | 10.676742 |
| GRATICULE-GRID-3-3 | 5228.18 | 5874.72 | 63.362777 | 11.007739 |
| GRATICULE-GRID-3-4 | 7842.43 | 5874.72 | 63.372450 | 11.338992 |
| GRATICULE-GRID-4-1 | -0.33 | 8812.02 | 63.176527 | 10.373248 |
| GRATICULE-GRID-4-2 | 2613.92 | 8812.02 | 63.186160 | 10.702066 |
| GRATICULE-GRID-4-3 | 5228.18 | 8812.02 | 63.195793 | 11.031139 |
| GRATICULE-GRID-4-4 | 7842.43 | 8812.02 | 63.205425 | 11.360469 |

## Independent validation residuals

| Holdout point | Pixel X | Pixel Y | Latitude | Longitude | Error (m) | Error (px) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HELD-OUT-BOTTOM-LON-1 | 1934.87 | 8812.02 | 63.183658 | 10.616667 | 1.8 | 0.34 |
| HELD-OUT-BOTTOM-LON-2 | 5907.23 | 8812.02 | 63.198295 | 11.116667 | 0.4 | 0.02 |
| HELD-OUT-TOP-LON-3 | 2018.87 | 0.12 | 63.684796 | 10.550000 | 4.3 | 0.75 |
| HELD-OUT-TOP-LON-4 | 5793.23 | 0.12 | 63.698880 | 11.033333 | 0.7 | 0.15 |
| HELD-OUT-LEFT-LAT-5 | -0.33 | 2238.35 | 63.550000 | 10.312270 | 7.4 | 1.18 |
| HELD-OUT-LEFT-LAT-6 | -0.33 | 6639.82 | 63.300000 | 10.353098 | 5.0 | 0.79 |
| HELD-OUT-RIGHT-LAT-7 | 7842.43 | 2166.35 | 63.583333 | 11.311878 | 0.0 | 0.08 |
| HELD-OUT-RIGHT-LAT-8 | 7842.43 | 6561.78 | 63.333333 | 11.344016 | 5.2 | 0.83 |
