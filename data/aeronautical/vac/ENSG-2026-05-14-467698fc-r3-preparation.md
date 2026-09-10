# VAC preparation: vac:ENSG:2026-05-14

- Source: [623161.pdf](https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/graphics/623161.pdf)
- Source SHA-256: `467698fc8df8b2457476b8a9201c3b4c2431bf89f1cd9ba7b9b161dd30011025`
- Source file: `623161.pdf`, page 1
- Render: 1200 DPI
- Target CRS: EPSG:3857
- Transform: second-order polynomial (16 fit points; 8 independent holdouts)
- Independent validation: 8 points
- RMS: 5.8 m / 1.36 px
- Maximum: 8.9 m / 2.08 px
- Gate: RMS <= 100 m; maximum <= 200 m
- Result: **PASS**
- Bounds: 60.9588345, 6.8117711 to 61.3420594, 7.5095881
- Raster assets: 1 file(s), 2693392 bytes

- Raster output: `public/aeronautical/vac/ensg/2026-05-14-467698fc-r3/chart.webp`

## Fit control points

| Point | Pixel X | Pixel Y | Latitude | Longitude |
| --- | ---: | ---: | ---: | ---: |
| GRATICULE-GRID-1-1 | 0.01 | -0.28 | 61.306400 | 6.811769 |
| GRATICULE-GRID-1-2 | 2615.03 | -0.28 | 61.318290 | 7.016423 |
| GRATICULE-GRID-1-3 | 5230.06 | -0.28 | 61.330180 | 7.221239 |
| GRATICULE-GRID-1-4 | 7845.08 | -0.28 | 61.342070 | 7.426219 |
| GRATICULE-GRID-2-1 | 0.01 | 3077.52 | 61.190548 | 6.841764 |
| GRATICULE-GRID-2-2 | 2615.03 | 3077.52 | 61.202426 | 7.045686 |
| GRATICULE-GRID-2-3 | 5230.06 | 3077.52 | 61.214304 | 7.249770 |
| GRATICULE-GRID-2-4 | 7845.08 | 3077.52 | 61.226182 | 7.454017 |
| GRATICULE-GRID-3-1 | 0.01 | 6155.33 | 61.074693 | 6.871759 |
| GRATICULE-GRID-3-2 | 2615.03 | 6155.33 | 61.086559 | 7.074949 |
| GRATICULE-GRID-3-3 | 5230.06 | 6155.33 | 61.098425 | 7.278301 |
| GRATICULE-GRID-3-4 | 7845.08 | 6155.33 | 61.110291 | 7.481816 |
| GRATICULE-GRID-4-1 | 0.01 | 9233.13 | 60.958836 | 6.901754 |
| GRATICULE-GRID-4-2 | 2615.03 | 9233.13 | 60.970690 | 7.104211 |
| GRATICULE-GRID-4-3 | 5230.06 | 9233.13 | 60.982544 | 7.306831 |
| GRATICULE-GRID-4-4 | 7845.08 | 9233.13 | 60.994398 | 7.509614 |

## Independent validation residuals

| Holdout point | Pixel X | Pixel Y | Latitude | Longitude | Error (m) | Error (px) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HELD-OUT-BOTTOM-LON-1 | 2128.30 | 9233.13 | 60.968484 | 7.066667 | 8.2 | 1.94 |
| HELD-OUT-BOTTOM-LON-2 | 5784.80 | 9233.13 | 60.985059 | 7.350000 | 8.9 | 2.08 |
| HELD-OUT-TOP-LON-3 | 1980.28 | -0.28 | 61.315404 | 6.966667 | 3.5 | 0.79 |
| HELD-OUT-TOP-LON-4 | 5808.80 | -0.28 | 61.332812 | 7.266667 | 4.1 | 0.95 |
| HELD-OUT-LEFT-LAT-5 | 0.01 | 2384.07 | 61.216667 | 6.835006 | 1.8 | 0.43 |
| HELD-OUT-LEFT-LAT-6 | 0.01 | 6812.75 | 61.050000 | 6.878166 | 6.0 | 1.42 |
| HELD-OUT-RIGHT-LAT-7 | 7845.08 | 2444.07 | 61.250000 | 7.448296 | 3.8 | 0.89 |
| HELD-OUT-RIGHT-LAT-8 | 7845.08 | 6872.75 | 61.083333 | 7.488295 | 6.2 | 1.48 |
