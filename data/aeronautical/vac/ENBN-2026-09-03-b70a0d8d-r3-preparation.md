# VAC preparation: vac:ENBN:2026-09-03

- Source: [643887.pdf](https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/graphics/643887.pdf)
- Source SHA-256: `b70a0d8d631ef96aef7fdb8713d7981a492b623987d92a96601368506d26e81d`
- Source file: `643887.pdf`, page 1
- Render: 1200 DPI
- Target CRS: EPSG:3857
- Transform: second-order polynomial (16 fit points; 8 independent holdouts)
- Independent validation: 8 points
- RMS: 0.9 m / 0.23 px
- Maximum: 1.4 m / 0.38 px
- Gate: RMS <= 100 m; maximum <= 200 m
- Result: **PASS**
- Bounds: 65.2845945, 11.8227280 to 65.6479585, 12.5760607
- Raster assets: 1 file(s), 1912472 bytes

- Raster output: `public/aeronautical/vac/enbn/2026-09-03-b70a0d8d-r3/chart.webp`

## Fit control points

| Point | Pixel X | Pixel Y | Latitude | Longitude |
| --- | ---: | ---: | ---: | ---: |
| GRATICULE-GRID-1-1 | 0.15 | -0.48 | 65.634726 | 11.822740 |
| GRATICULE-GRID-1-2 | 2614.08 | -0.48 | 65.639143 | 12.062839 |
| GRATICULE-GRID-1-3 | 5228.01 | -0.48 | 65.643560 | 12.303024 |
| GRATICULE-GRID-1-4 | 7841.94 | -0.48 | 65.647977 | 12.543296 |
| GRATICULE-GRID-2-1 | 0.15 | 3075.75 | 65.518011 | 11.836833 |
| GRATICULE-GRID-2-2 | 2614.08 | 3075.75 | 65.522425 | 12.075870 |
| GRATICULE-GRID-2-3 | 5228.01 | 3075.75 | 65.526840 | 12.314993 |
| GRATICULE-GRID-2-4 | 7841.94 | 3075.75 | 65.531254 | 12.554202 |
| GRATICULE-GRID-3-1 | 0.15 | 6151.98 | 65.401293 | 11.850927 |
| GRATICULE-GRID-3-2 | 2614.08 | 6151.98 | 65.405705 | 12.088901 |
| GRATICULE-GRID-3-3 | 5228.01 | 6151.98 | 65.410117 | 12.326962 |
| GRATICULE-GRID-3-4 | 7841.94 | 6151.98 | 65.414528 | 12.565109 |
| GRATICULE-GRID-4-1 | 0.15 | 9228.22 | 65.284572 | 11.865020 |
| GRATICULE-GRID-4-2 | 2614.08 | 9228.22 | 65.288981 | 12.101932 |
| GRATICULE-GRID-4-3 | 5228.01 | 9228.22 | 65.293390 | 12.338930 |
| GRATICULE-GRID-4-4 | 7841.94 | 9228.22 | 65.297799 | 12.576015 |

## Independent validation residuals

| Holdout point | Pixel X | Pixel Y | Latitude | Longitude | Error (m) | Error (px) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HELD-OUT-BOTTOM-LON-1 | 1857.33 | 9228.22 | 65.287704 | 12.033333 | 0.1 | 0.01 |
| HELD-OUT-BOTTOM-LON-2 | 5901.75 | 9228.22 | 65.294526 | 12.400000 | 1.4 | 0.38 |
| HELD-OUT-TOP-LON-3 | 1930.37 | -0.48 | 65.637987 | 12.000000 | 1.3 | 0.27 |
| HELD-OUT-TOP-LON-4 | 5920.73 | -0.48 | 65.644730 | 12.366667 | 1.1 | 0.29 |
| HELD-OUT-LEFT-LAT-5 | 0.15 | 2232.68 | 65.550000 | 11.832971 | 0.2 | 0.07 |
| HELD-OUT-LEFT-LAT-6 | 0.15 | 6625.03 | 65.383333 | 11.853094 | 1.2 | 0.30 |
| HELD-OUT-RIGHT-LAT-7 | 7841.94 | 2581.73 | 65.550000 | 12.552451 | 0.1 | 0.07 |
| HELD-OUT-RIGHT-LAT-8 | 7841.94 | 6974.05 | 65.383333 | 12.568023 | 0.2 | 0.07 |
