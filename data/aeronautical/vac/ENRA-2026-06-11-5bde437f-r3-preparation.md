# VAC preparation: vac:ENRA:2026-06-11

- Source: [638724.pdf](https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/graphics/638724.pdf)
- Source SHA-256: `5bde437fb064755551d8ef3b07f714a48b512bb679bc5dd046a452c36dd4f78e`
- Source file: `638724.pdf`, page 1
- Render: 1200 DPI
- Target CRS: EPSG:3857
- Transform: second-order polynomial (16 fit points; 8 independent holdouts)
- Independent validation: 8 points
- RMS: 3.9 m / 0.93 px
- Maximum: 6.0 m / 1.38 px
- Gate: RMS <= 100 m; maximum <= 200 m
- Result: **PASS**
- Bounds: 66.1876852, 13.9060430 to 66.5416470, 14.6582577
- Raster assets: 1 file(s), 2687820 bytes

- Raster output: `public/aeronautical/vac/enra/2026-06-11-5bde437f-r3/chart.webp`

## Fit control points

| Point | Pixel X | Pixel Y | Latitude | Longitude |
| --- | ---: | ---: | ---: | ---: |
| GRATICULE-GRID-1-1 | 0.16 | 0.12 | 66.538223 | 13.906058 |
| GRATICULE-GRID-1-2 | 2614.42 | 0.12 | 66.539363 | 14.155177 |
| GRATICULE-GRID-1-3 | 5228.68 | 0.12 | 66.540503 | 14.404313 |
| GRATICULE-GRID-1-4 | 7842.94 | 0.12 | 66.541643 | 14.653466 |
| GRATICULE-GRID-2-1 | 0.16 | 3076.44 | 66.421369 | 13.911126 |
| GRATICULE-GRID-2-2 | 2614.42 | 3076.44 | 66.422509 | 14.159090 |
| GRATICULE-GRID-2-3 | 5228.68 | 3076.44 | 66.423648 | 14.407071 |
| GRATICULE-GRID-2-4 | 7842.94 | 3076.44 | 66.424788 | 14.655068 |
| GRATICULE-GRID-3-1 | 0.16 | 6152.76 | 66.304522 | 13.916193 |
| GRATICULE-GRID-3-2 | 2614.42 | 6152.76 | 66.305662 | 14.163002 |
| GRATICULE-GRID-3-3 | 5228.68 | 6152.76 | 66.306801 | 14.409828 |
| GRATICULE-GRID-3-4 | 7842.94 | 6152.76 | 66.307941 | 14.656670 |
| GRATICULE-GRID-4-1 | 0.16 | 9229.08 | 66.187682 | 13.921261 |
| GRATICULE-GRID-4-2 | 2614.42 | 9229.08 | 66.188822 | 14.166915 |
| GRATICULE-GRID-4-3 | 5228.68 | 9229.08 | 66.189961 | 14.412585 |
| GRATICULE-GRID-4-4 | 7842.94 | 9229.08 | 66.191101 | 14.658273 |

## Independent validation residuals

| Holdout point | Pixel X | Pixel Y | Latitude | Longitude | Error (m) | Error (px) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HELD-OUT-BOTTOM-LON-1 | 2079.35 | 9229.08 | 66.188589 | 14.116667 | 1.5 | 0.38 |
| HELD-OUT-BOTTOM-LON-2 | 5802.73 | 9229.08 | 66.190211 | 14.466667 | 6.0 | 1.38 |
| HELD-OUT-TOP-LON-3 | 2034.35 | 0.12 | 66.539110 | 14.100000 | 4.5 | 1.09 |
| HELD-OUT-TOP-LON-4 | 5883.73 | 0.12 | 66.540788 | 14.466667 | 3.3 | 0.83 |
| HELD-OUT-LEFT-LAT-5 | 0.16 | 2322.33 | 66.450000 | 13.909884 | 1.5 | 0.35 |
| HELD-OUT-LEFT-LAT-6 | 0.16 | 6711.80 | 66.283333 | 13.917114 | 4.9 | 1.17 |
| HELD-OUT-RIGHT-LAT-7 | 7842.94 | 2412.37 | 66.450000 | 14.654722 | 1.4 | 0.33 |
| HELD-OUT-RIGHT-LAT-8 | 7842.94 | 6801.82 | 66.283333 | 14.657008 | 5.0 | 1.18 |
