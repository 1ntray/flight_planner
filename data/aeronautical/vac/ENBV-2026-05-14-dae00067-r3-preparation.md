# VAC preparation: vac:ENBV:2026-05-14

- Source: [623111.pdf](https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/graphics/623111.pdf)
- Source SHA-256: `dae00067a1df598045fabdb950bb3645e00f7166821974885d3f35a61cb20313`
- Source file: `623111.pdf`, page 1
- Render: 1200 DPI
- Target CRS: EPSG:3857
- Transform: second-order polynomial (16 fit points; 8 independent holdouts)
- Independent validation: 8 points
- RMS: 4.4 m / 1.08 px
- Maximum: 7.4 m / 1.76 px
- Gate: RMS <= 100 m; maximum <= 200 m
- Result: **PASS**
- Bounds: 70.6444161, 28.5038275 to 71.0526566, 29.6283230
- Raster assets: 1 file(s), 1112266 bytes

- Raster output: `public/aeronautical/vac/enbv/2026-05-14-dae00067-r3/chart.webp`

## Fit control points

| Point | Pixel X | Pixel Y | Latitude | Longitude |
| --- | ---: | ---: | ---: | ---: |
| GRATICULE-GRID-1-1 | 0.17 | -0.27 | 71.052665 | 28.741337 |
| GRATICULE-GRID-1-2 | 2615.09 | -0.27 | 71.029741 | 29.037722 |
| GRATICULE-GRID-1-3 | 5230.01 | -0.27 | 71.006818 | 29.333402 |
| GRATICULE-GRID-1-4 | 7844.94 | -0.27 | 70.983894 | 29.628378 |
| GRATICULE-GRID-2-1 | 0.17 | 3077.60 | 70.939180 | 28.662171 |
| GRATICULE-GRID-2-2 | 2615.09 | 3077.60 | 70.916360 | 28.956971 |
| GRATICULE-GRID-2-3 | 5230.01 | 3077.60 | 70.893540 | 29.251067 |
| GRATICULE-GRID-2-4 | 7844.94 | 3077.60 | 70.870720 | 29.544459 |
| GRATICULE-GRID-3-1 | 0.17 | 6155.47 | 70.825709 | 28.583004 |
| GRATICULE-GRID-3-2 | 2615.09 | 6155.47 | 70.802993 | 28.876220 |
| GRATICULE-GRID-3-3 | 5230.01 | 6155.47 | 70.780276 | 29.168732 |
| GRATICULE-GRID-3-4 | 7844.94 | 6155.47 | 70.757559 | 29.460539 |
| GRATICULE-GRID-4-1 | 0.17 | 9233.33 | 70.712252 | 28.503838 |
| GRATICULE-GRID-4-2 | 2615.09 | 9233.33 | 70.689639 | 28.795470 |
| GRATICULE-GRID-4-3 | 5230.01 | 9233.33 | 70.667026 | 29.086397 |
| GRATICULE-GRID-4-4 | 7844.94 | 9233.33 | 70.644412 | 29.376620 |

## Independent validation residuals

| Holdout point | Pixel X | Pixel Y | Latitude | Longitude | Error (m) | Error (px) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HELD-OUT-BOTTOM-LON-1 | 2056.38 | 9233.33 | 70.694471 | 28.733333 | 4.3 | 1.11 |
| HELD-OUT-BOTTOM-LON-2 | 5800.73 | 9233.33 | 70.662090 | 29.150000 | 7.4 | 1.76 |
| HELD-OUT-TOP-LON-3 | 1988.38 | -0.27 | 71.035235 | 28.966667 | 3.1 | 0.74 |
| HELD-OUT-TOP-LON-4 | 5820.73 | -0.27 | 71.001639 | 29.400000 | 3.6 | 0.96 |
| HELD-OUT-LEFT-LAT-5 | 0.17 | 2332.13 | 70.966667 | 28.681345 | 0.2 | 0.07 |
| HELD-OUT-LEFT-LAT-6 | 0.17 | 6852.93 | 70.800000 | 28.565065 | 0.2 | 0.13 |
| HELD-OUT-RIGHT-LAT-7 | 7844.94 | 2280.13 | 70.900000 | 29.566202 | 4.6 | 1.12 |
| HELD-OUT-RIGHT-LAT-8 | 7844.94 | 6812.92 | 70.733333 | 29.442614 | 6.2 | 1.49 |
