# VAC preparation: vac:ENVD:2026-05-14

- Source: [623185.pdf](https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/graphics/623185.pdf)
- Source SHA-256: `e09eeaa0b5302d3fb1352b9f5eafbbfa27f70c5abb649b59c44585668adc9b61`
- Source file: `623185.pdf`, page 1
- Render: 1200 DPI
- Target CRS: EPSG:3857
- Transform: second-order polynomial (16 fit points; 8 independent holdouts)
- Independent validation: 8 points
- RMS: 1.8 m / 0.38 px
- Maximum: 2.6 m / 0.53 px
- Gate: RMS <= 100 m; maximum <= 200 m
- Result: **PASS**
- Bounds: 69.8338700, 29.2360467 to 70.2955228, 30.4629339
- Raster assets: 1 file(s), 1545422 bytes

- Raster output: `public/aeronautical/vac/envd/2026-05-14-e09eeaa0-r3/chart.webp`

## Fit control points

| Point | Pixel X | Pixel Y | Latitude | Longitude |
| --- | ---: | ---: | ---: | ---: |
| GRATICULE-GRID-1-1 | -0.47 | -0.45 | 70.295546 | 29.506132 |
| GRATICULE-GRID-1-2 | 2613.09 | -0.45 | 70.268468 | 29.825942 |
| GRATICULE-GRID-1-3 | 5226.66 | -0.45 | 70.241389 | 30.144891 |
| GRATICULE-GRID-1-4 | 7840.23 | -0.45 | 70.214311 | 30.462978 |
| GRATICULE-GRID-2-1 | -0.47 | 3075.79 | 70.168358 | 29.416082 |
| GRATICULE-GRID-2-2 | 2613.09 | 3075.79 | 70.141405 | 29.734117 |
| GRATICULE-GRID-2-3 | 5226.66 | 3075.79 | 70.114451 | 30.051290 |
| GRATICULE-GRID-2-4 | 7840.23 | 3075.79 | 70.087498 | 30.367602 |
| GRATICULE-GRID-3-1 | -0.47 | 6152.04 | 70.041169 | 29.326032 |
| GRATICULE-GRID-3-2 | 2613.09 | 6152.04 | 70.014341 | 29.642292 |
| GRATICULE-GRID-3-3 | 5226.66 | 6152.04 | 69.987513 | 29.957690 |
| GRATICULE-GRID-3-4 | 7840.23 | 6152.04 | 69.960685 | 30.272227 |
| GRATICULE-GRID-4-1 | -0.47 | 9228.28 | 69.913980 | 29.235981 |
| GRATICULE-GRID-4-2 | 2613.09 | 9228.28 | 69.887277 | 29.550466 |
| GRATICULE-GRID-4-3 | 5226.66 | 9228.28 | 69.860574 | 29.864090 |
| GRATICULE-GRID-4-4 | 7840.23 | 9228.28 | 69.833871 | 30.176852 |

## Independent validation residuals

| Holdout point | Pixel X | Pixel Y | Latitude | Longitude | Error (m) | Error (px) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HELD-OUT-BOTTOM-LON-1 | 2054.43 | 9228.28 | 69.892985 | 29.483333 | 0.6 | 0.25 |
| HELD-OUT-BOTTOM-LON-2 | 5804.32 | 9228.28 | 69.854672 | 29.933333 | 1.6 | 0.35 |
| HELD-OUT-TOP-LON-3 | 1991.47 | -0.45 | 70.274908 | 29.750000 | 1.7 | 0.35 |
| HELD-OUT-TOP-LON-4 | 5815.32 | -0.45 | 70.235290 | 30.216667 | 2.2 | 0.35 |
| HELD-OUT-LEFT-LAT-5 | -0.47 | 2713.77 | 70.183333 | 29.426680 | 0.8 | 0.20 |
| HELD-OUT-LEFT-LAT-6 | -0.47 | 6744.12 | 70.016667 | 29.308700 | 2.6 | 0.53 |
| HELD-OUT-RIGHT-LAT-7 | 7840.23 | 2367.75 | 70.116667 | 30.389554 | 2.2 | 0.49 |
| HELD-OUT-RIGHT-LAT-8 | 7840.23 | 6815.12 | 69.933333 | 30.251669 | 1.9 | 0.43 |
