# VAC preparation: vac:ENBL:2026-05-14

- Source: [623097.pdf](https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/graphics/623097.pdf)
- Source SHA-256: `6d5098eb19b237790cd89ca2c35df3e383f37620f096381a00bab11b966e56be`
- Source file: `623097.pdf`, page 1
- Render: 1200 DPI
- Target CRS: EPSG:3857
- Transform: second-order polynomial (16 fit points; 8 independent holdouts)
- Independent validation: 8 points
- RMS: 3.1 m / 0.75 px
- Maximum: 5.5 m / 1.29 px
- Gate: RMS <= 100 m; maximum <= 200 m
- Result: **PASS**
- Bounds: 61.1803493, 5.3915860 to 61.5686732, 6.1081571
- Raster assets: 1 file(s), 3054968 bytes

- Raster output: `public/aeronautical/vac/enbl/2026-05-14-6d5098eb-r3/chart.webp`

## Fit control points

| Point | Pixel X | Pixel Y | Latitude | Longitude |
| --- | ---: | ---: | ---: | ---: |
| GRATICULE-GRID-1-1 | 0.16 | 0.12 | 61.526539 | 5.391600 |
| GRATICULE-GRID-1-2 | 2614.42 | 0.12 | 61.540582 | 5.596891 |
| GRATICULE-GRID-1-3 | 5228.68 | 0.12 | 61.554625 | 5.802386 |
| GRATICULE-GRID-1-4 | 7842.94 | 0.12 | 61.568669 | 6.008085 |
| GRATICULE-GRID-2-1 | 0.16 | 3076.44 | 61.411143 | 5.427181 |
| GRATICULE-GRID-2-2 | 2614.42 | 3076.44 | 61.425168 | 5.631734 |
| GRATICULE-GRID-2-3 | 5228.68 | 3076.44 | 61.439193 | 5.836490 |
| GRATICULE-GRID-2-4 | 7842.94 | 3076.44 | 61.453218 | 6.041451 |
| GRATICULE-GRID-3-1 | 0.16 | 6152.76 | 61.295742 | 5.462763 |
| GRATICULE-GRID-3-2 | 2614.42 | 6152.76 | 61.309749 | 5.666577 |
| GRATICULE-GRID-3-3 | 5228.68 | 6152.76 | 61.323756 | 5.870594 |
| GRATICULE-GRID-3-4 | 7842.94 | 6152.76 | 61.337763 | 6.074816 |
| GRATICULE-GRID-4-1 | 0.16 | 9229.08 | 61.180337 | 5.498344 |
| GRATICULE-GRID-4-2 | 2614.42 | 9229.08 | 61.194326 | 5.701419 |
| GRATICULE-GRID-4-3 | 5228.68 | 9229.08 | 61.208315 | 5.904699 |
| GRATICULE-GRID-4-4 | 7842.94 | 9229.08 | 61.222304 | 6.108182 |

## Independent validation residuals

| Holdout point | Pixel X | Pixel Y | Latitude | Longitude | Error (m) | Error (px) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HELD-OUT-BOTTOM-LON-1 | 1953.33 | 9229.08 | 61.190788 | 5.650000 | 2.5 | 0.59 |
| HELD-OUT-BOTTOM-LON-2 | 5811.73 | 9229.08 | 61.211435 | 5.950000 | 3.4 | 0.85 |
| HELD-OUT-TOP-LON-3 | 2016.35 | 0.12 | 61.537369 | 5.550000 | 4.9 | 1.20 |
| HELD-OUT-TOP-LON-4 | 5832.73 | 0.12 | 61.557870 | 5.850000 | 5.5 | 1.29 |
| HELD-OUT-LEFT-LAT-5 | 0.16 | 2484.38 | 61.433333 | 5.420333 | 2.0 | 0.49 |
| HELD-OUT-LEFT-LAT-6 | 0.16 | 6927.82 | 61.266667 | 5.471727 | 0.0 | 0.03 |
| HELD-OUT-RIGHT-LAT-7 | 7842.94 | 2274.33 | 61.483333 | 6.032751 | 1.4 | 0.34 |
| HELD-OUT-RIGHT-LAT-8 | 7842.94 | 6714.80 | 61.316667 | 6.080912 | 0.3 | 0.09 |
