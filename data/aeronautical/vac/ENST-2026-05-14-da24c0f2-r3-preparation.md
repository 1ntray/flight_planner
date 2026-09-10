# VAC preparation: vac:ENST:2026-05-14

- Source: [623171.pdf](https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/graphics/623171.pdf)
- Source SHA-256: `da24c0f2aec4743743650b99fcbe71b5fab730a646e1bea4539a1a98e6fcfe07`
- Source file: `623171.pdf`, page 1
- Render: 1200 DPI
- Target CRS: EPSG:3857
- Transform: second-order polynomial (16 fit points; 8 independent holdouts)
- Independent validation: 8 points
- RMS: 1.6 m / 0.35 px
- Maximum: 2.4 m / 0.51 px
- Gate: RMS <= 100 m; maximum <= 200 m
- Result: **PASS**
- Bounds: 65.7694211, 11.9121238 to 66.1775474, 12.7742892
- Raster assets: 1 file(s), 2422894 bytes

- Raster output: `public/aeronautical/vac/enst/2026-05-14-da24c0f2-r3/chart.webp`

## Fit control points

| Point | Pixel X | Pixel Y | Latitude | Longitude |
| --- | ---: | ---: | ---: | ---: |
| GRATICULE-GRID-1-1 | 0.19 | -0.43 | 66.163358 | 11.912141 |
| GRATICULE-GRID-1-2 | 2613.76 | -0.43 | 66.168094 | 12.187922 |
| GRATICULE-GRID-1-3 | 5227.33 | -0.43 | 66.172830 | 12.463794 |
| GRATICULE-GRID-1-4 | 7840.90 | -0.43 | 66.177566 | 12.739759 |
| GRATICULE-GRID-2-1 | 0.19 | 3075.83 | 66.032051 | 11.927859 |
| GRATICULE-GRID-2-2 | 2613.76 | 3075.83 | 66.036783 | 12.202236 |
| GRATICULE-GRID-2-3 | 5227.33 | 3075.83 | 66.041514 | 12.476706 |
| GRATICULE-GRID-2-4 | 7840.90 | 3075.83 | 66.046246 | 12.751268 |
| GRATICULE-GRID-3-1 | 0.19 | 6152.10 | 65.900740 | 11.943576 |
| GRATICULE-GRID-3-2 | 2613.76 | 6152.10 | 65.905467 | 12.216551 |
| GRATICULE-GRID-3-3 | 5227.33 | 6152.10 | 65.910194 | 12.489618 |
| GRATICULE-GRID-3-4 | 7840.90 | 6152.10 | 65.914922 | 12.762776 |
| GRATICULE-GRID-4-1 | 0.19 | 9228.37 | 65.769424 | 11.959293 |
| GRATICULE-GRID-4-2 | 2613.76 | 9228.37 | 65.774147 | 12.230865 |
| GRATICULE-GRID-4-3 | 5227.33 | 9228.37 | 65.778870 | 12.502529 |
| GRATICULE-GRID-4-4 | 7840.90 | 9228.37 | 65.783593 | 12.774285 |

## Independent validation residuals

| Holdout point | Pixel X | Pixel Y | Latitude | Longitude | Error (m) | Error (px) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HELD-OUT-BOTTOM-LON-1 | 1996.12 | 9228.37 | 65.773031 | 12.166667 | 0.6 | 0.07 |
| HELD-OUT-BOTTOM-LON-2 | 5843.98 | 9228.37 | 65.779984 | 12.566667 | 1.2 | 0.20 |
| HELD-OUT-TOP-LON-3 | 1938.12 | -0.43 | 66.166869 | 12.116667 | 2.1 | 0.50 |
| HELD-OUT-TOP-LON-4 | 5885.97 | -0.43 | 66.174023 | 12.533333 | 0.1 | 0.02 |
| HELD-OUT-LEFT-LAT-5 | 0.19 | 2655.82 | 66.050000 | 11.925713 | 2.3 | 0.49 |
| HELD-OUT-LEFT-LAT-6 | 0.19 | 6560.15 | 65.883333 | 11.945661 | 1.3 | 0.28 |
| HELD-OUT-RIGHT-LAT-7 | 7840.90 | 2597.82 | 66.066667 | 12.749479 | 1.6 | 0.35 |
| HELD-OUT-RIGHT-LAT-8 | 7840.90 | 6501.13 | 65.900000 | 12.764082 | 2.4 | 0.51 |
