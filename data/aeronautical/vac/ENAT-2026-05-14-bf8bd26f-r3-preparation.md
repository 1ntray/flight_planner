# VAC preparation: vac:ENAT:2026-05-14

- Source: [623095.pdf](https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/graphics/623095.pdf)
- Source SHA-256: `bf8bd26f94087c2b384d9d26603523aeaf2d494468f0d2f6ec3ddfd7a42d1e03`
- Source file: `623095.pdf`, page 1
- Render: 1200 DPI
- Target CRS: EPSG:3857
- Transform: second-order polynomial (16 fit points; 8 independent holdouts)
- Independent validation: 8 points
- RMS: 7.5 m / 1.07 px
- Maximum: 11.7 m / 1.78 px
- Gate: RMS <= 100 m; maximum <= 200 m
- Result: **PASS**
- Bounds: 69.7148853, 22.5378999 to 70.3442803, 24.1660956
- Raster assets: 1 file(s), 2828928 bytes

- Raster output: `public/aeronautical/vac/enat/2026-05-14-bf8bd26f-r3/chart.webp`

## Fit control points

| Point | Pixel X | Pixel Y | Latitude | Longitude |
| --- | ---: | ---: | ---: | ---: |
| GRATICULE-GRID-1-1 | 0.16 | -0.28 | 70.344296 | 22.746563 |
| GRATICULE-GRID-1-2 | 2615.08 | -0.28 | 70.322086 | 23.220832 |
| GRATICULE-GRID-1-3 | 5230.01 | -0.28 | 70.299875 | 23.693985 |
| GRATICULE-GRID-1-4 | 7844.93 | -0.28 | 70.277665 | 24.166022 |
| GRATICULE-GRID-2-1 | 0.16 | 3077.59 | 70.156277 | 22.677015 |
| GRATICULE-GRID-2-2 | 2615.08 | 3077.59 | 70.134207 | 23.147175 |
| GRATICULE-GRID-2-3 | 5230.01 | 3077.59 | 70.112138 | 23.616219 |
| GRATICULE-GRID-2-4 | 7844.93 | 3077.59 | 70.090068 | 24.084148 |
| GRATICULE-GRID-3-1 | 0.16 | 6155.46 | 69.968257 | 22.607468 |
| GRATICULE-GRID-3-2 | 2615.08 | 6155.46 | 69.946328 | 23.073519 |
| GRATICULE-GRID-3-3 | 5230.01 | 6155.46 | 69.924400 | 23.538454 |
| GRATICULE-GRID-3-4 | 7844.93 | 6155.46 | 69.902471 | 24.002274 |
| GRATICULE-GRID-4-1 | 0.16 | 9233.33 | 69.780237 | 22.537920 |
| GRATICULE-GRID-4-2 | 2615.08 | 9233.33 | 69.758449 | 22.999863 |
| GRATICULE-GRID-4-3 | 5230.01 | 9233.33 | 69.736661 | 23.460689 |
| GRATICULE-GRID-4-4 | 7844.93 | 9233.33 | 69.714873 | 23.920400 |

## Independent validation residuals

| Holdout point | Pixel X | Pixel Y | Latitude | Longitude | Error (m) | Error (px) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HELD-OUT-BOTTOM-LON-1 | 1956.37 | 9233.33 | 69.763937 | 22.883333 | 10.4 | 1.28 |
| HELD-OUT-BOTTOM-LON-2 | 5928.73 | 9233.33 | 69.730839 | 23.583333 | 11.7 | 1.78 |
| HELD-OUT-TOP-LON-3 | 1948.37 | -0.28 | 70.327749 | 23.100000 | 0.6 | 0.02 |
| HELD-OUT-TOP-LON-4 | 5816.73 | -0.28 | 70.294892 | 23.800000 | 0.2 | 0.19 |
| HELD-OUT-LEFT-LAT-5 | 0.16 | 2360.13 | 70.200000 | 22.693227 | 11.7 | 1.68 |
| HELD-OUT-LEFT-LAT-6 | 0.16 | 7000.95 | 69.916667 | 22.588363 | 6.5 | 1.00 |
| HELD-OUT-RIGHT-LAT-7 | 7844.93 | 2368.13 | 70.133333 | 24.103020 | 2.6 | 0.45 |
| HELD-OUT-RIGHT-LAT-8 | 7844.93 | 7016.95 | 69.850000 | 23.979358 | 4.1 | 0.60 |
