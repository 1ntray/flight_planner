# VAC preparation: vac:ENBS:2026-05-14

- Source: [623109.pdf](https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/graphics/623109.pdf)
- Source SHA-256: `45b78840982d772647d1f88ecf0a84d0017533521b2e1cc29bf13f09bd1249f3`
- Source file: `623109.pdf`, page 1
- Render: 1200 DPI
- Target CRS: EPSG:3857
- Transform: second-order polynomial (16 fit points; 8 independent holdouts)
- Independent validation: 8 points
- RMS: 4.5 m / 1.07 px
- Maximum: 8.4 m / 1.98 px
- Gate: RMS <= 100 m; maximum <= 200 m
- Result: **PASS**
- Bounds: 70.3982802, 29.1625653 to 70.8085615, 30.2817507
- Raster assets: 1 file(s), 1847856 bytes

- Raster output: `public/aeronautical/vac/enbs/2026-05-14-45b78840-r3/chart.webp`

## Fit control points

| Point | Pixel X | Pixel Y | Latitude | Longitude |
| --- | ---: | ---: | ---: | ---: |
| GRATICULE-GRID-1-1 | 0.17 | -0.27 | 70.808570 | 29.408389 |
| GRATICULE-GRID-1-2 | 2615.09 | -0.27 | 70.784630 | 29.700246 |
| GRATICULE-GRID-1-3 | 5230.02 | -0.27 | 70.760690 | 29.991375 |
| GRATICULE-GRID-1-4 | 7844.94 | -0.27 | 70.736750 | 30.281776 |
| GRATICULE-GRID-2-1 | 0.17 | 3077.60 | 70.695441 | 29.326451 |
| GRATICULE-GRID-2-2 | 2615.09 | 3077.60 | 70.671604 | 29.616791 |
| GRATICULE-GRID-2-3 | 5230.02 | 3077.60 | 70.647767 | 29.906403 |
| GRATICULE-GRID-2-4 | 7844.94 | 3077.60 | 70.623930 | 30.195287 |
| GRATICULE-GRID-3-1 | 0.17 | 6155.47 | 70.582307 | 29.244513 |
| GRATICULE-GRID-3-2 | 2615.09 | 6155.47 | 70.558573 | 29.533337 |
| GRATICULE-GRID-3-3 | 5230.02 | 6155.47 | 70.534839 | 29.821432 |
| GRATICULE-GRID-3-4 | 7844.94 | 6155.47 | 70.511105 | 30.108798 |
| GRATICULE-GRID-4-1 | 0.17 | 9233.33 | 70.469169 | 29.162575 |
| GRATICULE-GRID-4-2 | 2615.09 | 9233.33 | 70.445538 | 29.449882 |
| GRATICULE-GRID-4-3 | 5230.02 | 9233.33 | 70.421906 | 29.736460 |
| GRATICULE-GRID-4-4 | 7844.94 | 9233.33 | 70.398275 | 30.022309 |

## Independent validation residuals

| Holdout point | Pixel X | Pixel Y | Latitude | Longitude | Error (m) | Error (px) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HELD-OUT-BOTTOM-LON-1 | 2008.38 | 9233.33 | 70.451020 | 29.383333 | 1.8 | 0.51 |
| HELD-OUT-BOTTOM-LON-2 | 5812.75 | 9233.33 | 70.416640 | 29.800000 | 8.4 | 1.98 |
| HELD-OUT-TOP-LON-3 | 2016.38 | -0.27 | 70.790111 | 29.633333 | 5.6 | 1.34 |
| HELD-OUT-TOP-LON-4 | 5756.73 | -0.27 | 70.755867 | 30.050000 | 2.6 | 0.53 |
| HELD-OUT-LEFT-LAT-5 | 0.17 | 2500.15 | 70.716667 | 29.341823 | 0.1 | 0.06 |
| HELD-OUT-LEFT-LAT-6 | 0.17 | 6580.88 | 70.566667 | 29.233188 | 0.4 | 0.13 |
| HELD-OUT-RIGHT-LAT-7 | 7844.94 | 2368.15 | 70.650000 | 30.215223 | 7.2 | 1.70 |
| HELD-OUT-RIGHT-LAT-8 | 7844.94 | 6912.93 | 70.483333 | 30.087513 | 0.5 | 0.14 |
