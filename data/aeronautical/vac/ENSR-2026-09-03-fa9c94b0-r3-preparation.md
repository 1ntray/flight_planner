# VAC preparation: vac:ENSR:2026-09-03

- Source: [643749.pdf](https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/graphics/643749.pdf)
- Source SHA-256: `fa9c94b074a03a5b49465b2a86601067cde480460c5441ffe47a5061a54d4668`
- Source file: `643749.pdf`, page 1
- Render: 1200 DPI
- Target CRS: EPSG:3857
- Transform: second-order polynomial (16 fit points; 8 independent holdouts)
- Independent validation: 8 points
- RMS: 0.8 m / 0.21 px
- Maximum: 1.6 m / 0.40 px
- Gate: RMS <= 100 m; maximum <= 200 m
- Result: **PASS**
- Bounds: 69.6915745, 20.5540022 to 70.0693791, 21.5143830
- Raster assets: 1 file(s), 2807556 bytes

- Raster output: `public/aeronautical/vac/ensr/2026-09-03-fa9c94b0-r3/chart.webp`

## Fit control points

| Point | Pixel X | Pixel Y | Latitude | Longitude |
| --- | ---: | ---: | ---: | ---: |
| GRATICULE-GRID-1-1 | 0.19 | -0.43 | 70.069395 | 20.647209 |
| GRATICULE-GRID-1-2 | 2613.76 | -0.43 | 70.059589 | 20.936580 |
| GRATICULE-GRID-1-3 | 5227.33 | -0.43 | 70.049783 | 21.225654 |
| GRATICULE-GRID-1-4 | 7840.90 | -0.43 | 70.039977 | 21.514430 |
| GRATICULE-GRID-2-1 | 0.19 | 3075.83 | 69.953236 | 20.616146 |
| GRATICULE-GRID-2-2 | 2613.76 | 3075.83 | 69.943437 | 20.903950 |
| GRATICULE-GRID-2-3 | 5227.33 | 3075.83 | 69.933639 | 21.191457 |
| GRATICULE-GRID-2-4 | 7840.90 | 3075.83 | 69.923840 | 21.478666 |
| GRATICULE-GRID-3-1 | 0.19 | 6152.10 | 69.837074 | 20.585082 |
| GRATICULE-GRID-3-2 | 2613.76 | 6152.10 | 69.827283 | 20.871320 |
| GRATICULE-GRID-3-3 | 5227.33 | 6152.10 | 69.817491 | 21.157260 |
| GRATICULE-GRID-3-4 | 7840.90 | 6152.10 | 69.807699 | 21.442902 |
| GRATICULE-GRID-4-1 | 0.19 | 9228.37 | 69.720909 | 20.554019 |
| GRATICULE-GRID-4-2 | 2613.76 | 9228.37 | 69.711124 | 20.838689 |
| GRATICULE-GRID-4-3 | 5227.33 | 9228.37 | 69.701340 | 21.123062 |
| GRATICULE-GRID-4-4 | 7840.90 | 9228.37 | 69.691555 | 21.407138 |

## Independent validation residuals

| Holdout point | Pixel X | Pixel Y | Latitude | Longitude | Error (m) | Error (px) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HELD-OUT-BOTTOM-LON-1 | 1952.12 | 9228.37 | 69.713601 | 20.766667 | 0.6 | 0.21 |
| HELD-OUT-BOTTOM-LON-2 | 5934.97 | 9228.37 | 69.698690 | 21.200000 | 0.2 | 0.10 |
| HELD-OUT-TOP-LON-3 | 1982.12 | -0.43 | 70.061959 | 20.866667 | 0.2 | 0.02 |
| HELD-OUT-TOP-LON-4 | 5748.98 | -0.43 | 70.047825 | 21.283333 | 0.7 | 0.09 |
| HELD-OUT-LEFT-LAT-5 | 0.19 | 2278.77 | 69.983333 | 20.624194 | 0.0 | 0.07 |
| HELD-OUT-LEFT-LAT-6 | 0.19 | 6692.15 | 69.816667 | 20.579629 | 1.6 | 0.40 |
| HELD-OUT-RIGHT-LAT-7 | 7840.90 | 2382.78 | 69.950000 | 21.486723 | 0.5 | 0.15 |
| HELD-OUT-RIGHT-LAT-8 | 7840.90 | 6797.15 | 69.783333 | 21.435402 | 1.4 | 0.34 |
