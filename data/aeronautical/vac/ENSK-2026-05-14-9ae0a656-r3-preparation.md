# VAC preparation: vac:ENSK:2026-05-14

- Source: [623165.pdf](https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/graphics/623165.pdf)
- Source SHA-256: `9ae0a6564e75ffed1c958410daabb29ccd91d2ee19b3df3e1522e6d2683423a8`
- Source file: `623165.pdf`, page 1
- Render: 1200 DPI
- Target CRS: EPSG:3857
- Transform: second-order polynomial (16 fit points; 8 independent holdouts)
- Independent validation: 8 points
- RMS: 1.4 m / 0.33 px
- Maximum: 2.3 m / 0.54 px
- Gate: RMS <= 100 m; maximum <= 200 m
- Result: **PASS**
- Bounds: 68.3729422, 14.6794558 to 68.7237951, 15.4993205
- Raster assets: 1 file(s), 2323162 bytes

- Raster output: `public/aeronautical/vac/ensk/2026-05-14-9ae0a656-r3/chart.webp`

## Fit control points

| Point | Pixel X | Pixel Y | Latitude | Longitude |
| --- | ---: | ---: | ---: | ---: |
| GRATICULE-GRID-1-1 | -0.31 | -0.45 | 68.723812 | 14.679424 |
| GRATICULE-GRID-1-2 | 2613.26 | -0.45 | 68.723668 | 14.952730 |
| GRATICULE-GRID-1-3 | 5226.83 | -0.45 | 68.723524 | 15.226025 |
| GRATICULE-GRID-1-4 | 7840.39 | -0.45 | 68.723380 | 15.499311 |
| GRATICULE-GRID-2-1 | -0.31 | 3075.81 | 68.606998 | 14.681071 |
| GRATICULE-GRID-2-2 | 2613.26 | 3075.81 | 68.606853 | 14.952971 |
| GRATICULE-GRID-2-3 | 5226.83 | 3075.81 | 68.606708 | 15.224862 |
| GRATICULE-GRID-2-4 | 7840.39 | 3075.81 | 68.606563 | 15.496742 |
| GRATICULE-GRID-3-1 | -0.31 | 6152.06 | 68.490181 | 14.682718 |
| GRATICULE-GRID-3-2 | 2613.26 | 6152.06 | 68.490036 | 14.953213 |
| GRATICULE-GRID-3-3 | 5226.83 | 6152.06 | 68.489890 | 15.223698 |
| GRATICULE-GRID-3-4 | 7840.39 | 6152.06 | 68.489745 | 15.494173 |
| GRATICULE-GRID-4-1 | -0.31 | 9228.32 | 68.373362 | 14.684365 |
| GRATICULE-GRID-4-2 | 2613.26 | 9228.32 | 68.373216 | 14.953455 |
| GRATICULE-GRID-4-3 | 5226.83 | 9228.32 | 68.373069 | 15.222534 |
| GRATICULE-GRID-4-4 | 7840.39 | 9228.32 | 68.372923 | 15.491604 |

## Independent validation residuals

| Holdout point | Pixel X | Pixel Y | Latitude | Longitude | Error (m) | Error (px) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HELD-OUT-BOTTOM-LON-1 | 2093.62 | 9228.32 | 68.373245 | 14.900000 | 1.9 | 0.50 |
| HELD-OUT-BOTTOM-LON-2 | 5817.45 | 9228.32 | 68.373036 | 15.283333 | 0.3 | 0.12 |
| HELD-OUT-TOP-LON-3 | 1949.62 | -0.45 | 68.723705 | 14.883333 | 0.1 | 0.07 |
| HELD-OUT-TOP-LON-4 | 5774.45 | -0.45 | 68.723494 | 15.283333 | 1.8 | 0.38 |
| HELD-OUT-LEFT-LAT-5 | -0.31 | 2381.75 | 68.633333 | 14.680699 | 2.3 | 0.54 |
| HELD-OUT-LEFT-LAT-6 | -0.31 | 6771.12 | 68.466667 | 14.683049 | 0.7 | 0.19 |
| HELD-OUT-RIGHT-LAT-7 | 7840.39 | 2370.77 | 68.633333 | 15.497330 | 0.3 | 0.11 |
| HELD-OUT-RIGHT-LAT-8 | 7840.39 | 6760.12 | 68.466667 | 15.493665 | 1.4 | 0.35 |
