# VAC preparation: vac:ENMS:2026-09-03

- Source: [643752.pdf](https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/graphics/643752.pdf)
- Source SHA-256: `5f288934e4e16ebf6d487cf1e99927380914d2c9b9a03d7812e1da1caf2e6e27`
- Source file: `643752.pdf`, page 1
- Render: 1200 DPI
- Target CRS: EPSG:3857
- Transform: second-order polynomial (16 fit points; 8 independent holdouts)
- Independent validation: 8 points
- RMS: 1.1 m / 0.28 px
- Maximum: 1.9 m / 0.46 px
- Gate: RMS <= 100 m; maximum <= 200 m
- Result: **PASS**
- Bounds: 65.5526492, 12.9000916 to 65.9468915, 13.7219006
- Raster assets: 1 file(s), 2349252 bytes

- Raster output: `public/aeronautical/vac/enms/2026-09-03-5f288934-r3/chart.webp`

## Fit control points

| Point | Pixel X | Pixel Y | Latitude | Longitude |
| --- | ---: | ---: | ---: | ---: |
| GRATICULE-GRID-1-1 | 0.19 | -0.43 | 65.938096 | 12.900109 |
| GRATICULE-GRID-1-2 | 2613.76 | -0.43 | 65.941034 | 13.167562 |
| GRATICULE-GRID-1-3 | 5227.33 | -0.43 | 65.943972 | 13.435075 |
| GRATICULE-GRID-1-4 | 7840.90 | -0.43 | 65.946909 | 13.702648 |
| GRATICULE-GRID-2-1 | 0.19 | 3075.83 | 65.809608 | 12.910466 |
| GRATICULE-GRID-2-2 | 2613.76 | 3075.83 | 65.812546 | 13.176601 |
| GRATICULE-GRID-2-3 | 5227.33 | 3075.83 | 65.815483 | 13.442796 |
| GRATICULE-GRID-2-4 | 7840.90 | 3075.83 | 65.818421 | 13.709052 |
| GRATICULE-GRID-3-1 | 0.19 | 6152.10 | 65.681119 | 12.920823 |
| GRATICULE-GRID-3-2 | 2613.76 | 6152.10 | 65.684057 | 13.185640 |
| GRATICULE-GRID-3-3 | 5227.33 | 6152.10 | 65.686995 | 13.450518 |
| GRATICULE-GRID-3-4 | 7840.90 | 6152.10 | 65.689933 | 13.715456 |
| GRATICULE-GRID-4-1 | 0.19 | 9228.37 | 65.552631 | 12.931180 |
| GRATICULE-GRID-4-2 | 2613.76 | 9228.37 | 65.555569 | 13.194679 |
| GRATICULE-GRID-4-3 | 5227.33 | 9228.37 | 65.558507 | 13.458240 |
| GRATICULE-GRID-4-4 | 7840.90 | 9228.37 | 65.561445 | 13.721860 |

## Independent validation residuals

| Holdout point | Pixel X | Pixel Y | Latitude | Longitude | Error (m) | Error (px) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HELD-OUT-BOTTOM-LON-1 | 2005.12 | 9228.37 | 65.554885 | 13.133333 | 1.0 | 0.27 |
| HELD-OUT-BOTTOM-LON-2 | 5806.98 | 9228.37 | 65.559159 | 13.516667 | 1.6 | 0.40 |
| HELD-OUT-TOP-LON-3 | 2116.12 | -0.43 | 65.940474 | 13.116667 | 1.6 | 0.38 |
| HELD-OUT-TOP-LON-4 | 5861.97 | -0.43 | 65.944685 | 13.500000 | 1.9 | 0.46 |
| HELD-OUT-LEFT-LAT-5 | 0.19 | 2507.80 | 65.833333 | 12.908554 | 0.0 | 0.08 |
| HELD-OUT-LEFT-LAT-6 | 0.19 | 6498.13 | 65.666667 | 12.921988 | 0.0 | 0.08 |
| HELD-OUT-RIGHT-LAT-7 | 7840.90 | 2718.82 | 65.833333 | 13.708309 | 0.0 | 0.08 |
| HELD-OUT-RIGHT-LAT-8 | 7840.90 | 6709.15 | 65.666667 | 13.716616 | 0.0 | 0.08 |
