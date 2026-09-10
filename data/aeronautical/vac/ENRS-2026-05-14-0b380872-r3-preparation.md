# VAC preparation: vac:ENRS:2026-05-14

- Source: [623157.pdf](https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/graphics/623157.pdf)
- Source SHA-256: `0b3808721d83ef97bf2d6b9dcfa712b9303f797d5d9e80bea0c8a88beb35004a`
- Source file: `623157.pdf`, page 1
- Render: 1200 DPI
- Target CRS: EPSG:3857
- Transform: second-order polynomial (16 fit points; 8 independent holdouts)
- Independent validation: 8 points
- RMS: 1.6 m / 0.39 px
- Maximum: 2.0 m / 0.52 px
- Gate: RMS <= 100 m; maximum <= 200 m
- Result: **PASS**
- Bounds: 67.3297269, 11.6458205 to 67.6938460, 12.4662141
- Raster assets: 1 file(s), 1080006 bytes

- Raster output: `public/aeronautical/vac/enrs/2026-05-14-0b380872-r3/chart.webp`

## Fit control points

| Point | Pixel X | Pixel Y | Latitude | Longitude |
| --- | ---: | ---: | ---: | ---: |
| GRATICULE-GRID-1-1 | 0.21 | -0.45 | 67.679721 | 11.645839 |
| GRATICULE-GRID-1-2 | 2613.77 | -0.45 | 67.684435 | 11.906598 |
| GRATICULE-GRID-1-3 | 5227.34 | -0.45 | 67.689149 | 12.167471 |
| GRATICULE-GRID-1-4 | 7840.91 | -0.45 | 67.693863 | 12.428456 |
| GRATICULE-GRID-2-1 | 0.21 | 3075.81 | 67.563055 | 11.662228 |
| GRATICULE-GRID-2-2 | 2613.77 | 3075.81 | 67.567765 | 11.921714 |
| GRATICULE-GRID-2-3 | 5227.34 | 3075.81 | 67.572476 | 12.181313 |
| GRATICULE-GRID-2-4 | 7840.91 | 3075.81 | 67.577187 | 12.441025 |
| GRATICULE-GRID-3-1 | 0.21 | 6152.06 | 67.446383 | 11.678618 |
| GRATICULE-GRID-3-2 | 2613.77 | 6152.06 | 67.451091 | 11.936831 |
| GRATICULE-GRID-3-3 | 5227.34 | 6152.06 | 67.455798 | 12.195156 |
| GRATICULE-GRID-3-4 | 7840.91 | 6152.06 | 67.460506 | 12.453595 |
| GRATICULE-GRID-4-1 | 0.21 | 9228.32 | 67.329706 | 11.695007 |
| GRATICULE-GRID-4-2 | 2613.77 | 9228.32 | 67.334411 | 11.951947 |
| GRATICULE-GRID-4-3 | 5227.34 | 9228.32 | 67.339115 | 12.208999 |
| GRATICULE-GRID-4-4 | 7840.91 | 9228.32 | 67.343819 | 12.466164 |

## Independent validation residuals

| Holdout point | Pixel X | Pixel Y | Latitude | Longitude | Error (m) | Error (px) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HELD-OUT-BOTTOM-LON-1 | 1916.15 | 9228.32 | 67.333155 | 11.883333 | 0.8 | 0.15 |
| HELD-OUT-BOTTOM-LON-2 | 5813.98 | 9228.32 | 67.340171 | 12.266667 | 2.0 | 0.52 |
| HELD-OUT-TOP-LON-3 | 2046.12 | -0.45 | 67.683411 | 11.850000 | 2.0 | 0.52 |
| HELD-OUT-TOP-LON-4 | 5719.98 | -0.45 | 67.690038 | 12.216667 | 0.4 | 0.07 |
| HELD-OUT-LEFT-LAT-5 | 0.21 | 2540.77 | 67.583333 | 11.659378 | 1.5 | 0.35 |
| HELD-OUT-LEFT-LAT-6 | 0.21 | 6935.13 | 67.416667 | 11.682790 | 1.8 | 0.43 |
| HELD-OUT-RIGHT-LAT-7 | 7840.91 | 2474.77 | 67.600000 | 12.438569 | 1.8 | 0.44 |
| HELD-OUT-RIGHT-LAT-8 | 7840.91 | 6868.12 | 67.433333 | 12.456520 | 1.3 | 0.32 |
