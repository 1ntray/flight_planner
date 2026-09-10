# VAC preparation: vac:ENMH:2026-05-14

- Source: [623131.pdf](https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/graphics/623131.pdf)
- Source SHA-256: `82939c23e8322bc81f1e65674ed5ef86b5d71d8b957a9a2877b8d8b6f0c533e3`
- Source file: `623131.pdf`, page 1
- Render: 1200 DPI
- Target CRS: EPSG:3857
- Transform: second-order polynomial (16 fit points; 8 independent holdouts)
- Independent validation: 8 points
- RMS: 1.1 m / 0.25 px
- Maximum: 1.6 m / 0.42 px
- Gate: RMS <= 100 m; maximum <= 200 m
- Result: **PASS**
- Bounds: 70.8271286, 27.2763071 to 71.2312192, 28.3946395
- Raster assets: 1 file(s), 1687442 bytes

- Raster output: `public/aeronautical/vac/enmh/2026-05-14-82939c23-r3/chart.webp`

## Fit control points

| Point | Pixel X | Pixel Y | Latitude | Longitude |
| --- | ---: | ---: | ---: | ---: |
| GRATICULE-GRID-1-1 | 0.19 | -0.43 | 71.231234 | 27.495064 |
| GRATICULE-GRID-1-2 | 2613.76 | -0.43 | 71.210258 | 27.795582 |
| GRATICULE-GRID-1-3 | 5227.33 | -0.43 | 71.189281 | 28.095424 |
| GRATICULE-GRID-1-4 | 7840.90 | -0.43 | 71.168305 | 28.394591 |
| GRATICULE-GRID-2-1 | 0.19 | 3075.83 | 71.117244 | 27.422149 |
| GRATICULE-GRID-2-2 | 2613.76 | 3075.83 | 71.096358 | 27.721052 |
| GRATICULE-GRID-2-3 | 5227.33 | 3075.83 | 71.075472 | 28.019279 |
| GRATICULE-GRID-2-4 | 7840.90 | 3075.83 | 71.054585 | 28.316832 |
| GRATICULE-GRID-3-1 | 0.19 | 6152.10 | 71.003247 | 27.349234 |
| GRATICULE-GRID-3-2 | 2613.76 | 6152.10 | 70.982451 | 27.646522 |
| GRATICULE-GRID-3-3 | 5227.33 | 6152.10 | 70.961654 | 27.943135 |
| GRATICULE-GRID-3-4 | 7840.90 | 6152.10 | 70.940858 | 28.239073 |
| GRATICULE-GRID-4-1 | 0.19 | 9228.37 | 70.889243 | 27.276319 |
| GRATICULE-GRID-4-2 | 2613.76 | 9228.37 | 70.868536 | 27.571993 |
| GRATICULE-GRID-4-3 | 5227.33 | 9228.37 | 70.847830 | 27.866991 |
| GRATICULE-GRID-4-4 | 7840.90 | 9228.37 | 70.827123 | 28.161314 |

## Independent validation residuals

| Holdout point | Pixel X | Pixel Y | Latitude | Longitude | Error (m) | Error (px) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HELD-OUT-BOTTOM-LON-1 | 1977.12 | 9228.37 | 70.873580 | 27.500000 | 1.2 | 0.18 |
| HELD-OUT-BOTTOM-LON-2 | 5815.98 | 9228.37 | 70.843166 | 27.933333 | 0.3 | 0.06 |
| HELD-OUT-TOP-LON-3 | 1927.12 | -0.43 | 71.215768 | 27.716667 | 1.0 | 0.23 |
| HELD-OUT-TOP-LON-4 | 5848.97 | -0.43 | 71.184292 | 28.166667 | 0.9 | 0.12 |
| HELD-OUT-LEFT-LAT-5 | 0.19 | 2641.82 | 71.133333 | 27.432436 | 0.7 | 0.19 |
| HELD-OUT-LEFT-LAT-6 | 0.19 | 6689.15 | 70.983333 | 27.336505 | 1.3 | 0.32 |
| HELD-OUT-RIGHT-LAT-7 | 7840.90 | 2297.78 | 71.083333 | 28.336499 | 1.6 | 0.42 |
| HELD-OUT-RIGHT-LAT-8 | 7840.90 | 6806.15 | 70.916667 | 28.222540 | 1.2 | 0.30 |
