# VAC preparation: vac:ENNM:2026-05-14

- Source: [623139.pdf](https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/graphics/623139.pdf)
- Source SHA-256: `91281a0825af0326c093fd4508f41e8c299bc0148bb2ae70a43ff4a71fb49309`
- Source file: `623139.pdf`, page 1
- Render: 1200 DPI
- Target CRS: EPSG:3857
- Transform: second-order polynomial (16 fit points; 8 independent holdouts)
- Independent validation: 8 points
- RMS: 4.1 m / 0.86 px
- Maximum: 5.3 m / 1.11 px
- Gate: RMS <= 100 m; maximum <= 200 m
- Result: **PASS**
- Bounds: 64.2597000, 11.1590704 to 64.6715368, 11.9837379
- Raster assets: 1 file(s), 2414228 bytes

- Raster output: `public/aeronautical/vac/ennm/2026-05-14-91281a08-r3/chart.webp`

## Fit control points

| Point | Pixel X | Pixel Y | Latitude | Longitude |
| --- | ---: | ---: | ---: | ---: |
| GRATICULE-GRID-1-1 | 0.01 | 0.07 | 64.653414 | 11.159072 |
| GRATICULE-GRID-1-2 | 2614.38 | 0.07 | 64.659454 | 11.419233 |
| GRATICULE-GRID-1-3 | 5228.74 | 0.07 | 64.665494 | 11.679539 |
| GRATICULE-GRID-1-4 | 7843.11 | 0.07 | 64.671534 | 11.939988 |
| GRATICULE-GRID-2-1 | 0.01 | 3076.33 | 64.522187 | 11.177381 |
| GRATICULE-GRID-2-2 | 2614.38 | 3076.33 | 64.528218 | 11.436305 |
| GRATICULE-GRID-2-3 | 5228.74 | 3076.33 | 64.534249 | 11.695373 |
| GRATICULE-GRID-2-4 | 7843.11 | 3076.33 | 64.540281 | 11.954584 |
| GRATICULE-GRID-3-1 | 0.01 | 6152.60 | 64.390949 | 11.195690 |
| GRATICULE-GRID-3-2 | 2614.38 | 6152.60 | 64.396971 | 11.453377 |
| GRATICULE-GRID-3-3 | 5228.74 | 6152.60 | 64.402994 | 11.711207 |
| GRATICULE-GRID-3-4 | 7843.11 | 6152.60 | 64.409016 | 11.969181 |
| GRATICULE-GRID-4-1 | 0.01 | 9228.87 | 64.259700 | 11.213999 |
| GRATICULE-GRID-4-2 | 2614.38 | 9228.87 | 64.265713 | 11.470448 |
| GRATICULE-GRID-4-3 | 5228.74 | 9228.87 | 64.271727 | 11.727041 |
| GRATICULE-GRID-4-4 | 7843.11 | 9228.87 | 64.277740 | 11.983778 |

## Independent validation residuals

| Holdout point | Pixel X | Pixel Y | Latitude | Longitude | Error (m) | Error (px) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HELD-OUT-BOTTOM-LON-1 | 2067.30 | 9228.87 | 64.264455 | 11.416667 | 5.1 | 1.04 |
| HELD-OUT-BOTTOM-LON-2 | 5802.82 | 9228.87 | 64.273047 | 11.783333 | 3.4 | 0.77 |
| HELD-OUT-TOP-LON-3 | 2085.30 | 0.07 | 64.658232 | 11.366667 | 4.5 | 1.00 |
| HELD-OUT-TOP-LON-4 | 5769.80 | 0.07 | 64.666744 | 11.733333 | 4.5 | 0.98 |
| HELD-OUT-LEFT-LAT-5 | 0.01 | 2424.27 | 64.550000 | 11.173500 | 0.4 | 0.12 |
| HELD-OUT-LEFT-LAT-6 | 0.01 | 6720.65 | 64.366667 | 11.199071 | 5.3 | 1.11 |
| HELD-OUT-RIGHT-LAT-7 | 7843.11 | 2457.27 | 64.566667 | 11.951647 | 3.1 | 0.66 |
| HELD-OUT-RIGHT-LAT-8 | 7843.11 | 6753.65 | 64.383333 | 11.972033 | 3.8 | 0.81 |
