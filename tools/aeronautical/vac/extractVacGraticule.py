"""Extract reviewed georeferencing controls from a vector Avinor VAC graticule.

The VAC frame publishes longitude ticks along its top/bottom edges and latitude
ticks along its left/right edges. This offline helper fits the two coordinate
dimensions independently, holds back deterministic edge ticks for validation,
and emits WGS84 grid intersections for the existing fail-closed VAC preparer.

It does not publish or activate a chart. Its JSON output must be reviewed and
checked in before it can become an approved preparation input.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import statistics
from pathlib import Path

import numpy
import pdfplumber


def chart_frame(page: pdfplumber.page.Page) -> dict[str, float]:
    candidates = [
        rectangle for rectangle in page.rects
        if 400 <= rectangle["width"] <= 520 and 400 <= rectangle["height"] <= 620
    ]
    if not candidates:
        raise ValueError("No VAC plan-view frame was found")
    rectangle = max(candidates, key=lambda item: item["width"] * item["height"])
    return {
        "left": float(rectangle["x0"]), "top": float(rectangle["top"]),
        "right": float(rectangle["x1"]), "bottom": float(rectangle["bottom"]),
    }


def parse_longitude(text: str) -> float | None:
    match = re.fullmatch(r"(\d{3}).(\d{2})'([EW])", text)
    if not match:
        return None
    degrees, minutes, hemisphere = match.groups()
    value = int(degrees) + int(minutes) / 60
    return -value if hemisphere == "W" else value


def parse_latitude(text: str) -> float | None:
    normalized = text[::-1] if text.startswith(("N", "S")) else text
    match = re.fullmatch(r"(\d{2}).(\d{2})'([NS])", normalized)
    if not match:
        return None
    degrees, minutes, hemisphere = match.groups()
    value = int(degrees) + int(minutes) / 60
    return -value if hemisphere == "S" else value


def chart_date(page: pdfplumber.page.Page) -> str:
    months = {
        "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
        "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12,
    }
    matches = re.findall(
        r"\b(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(20\d{2})\b",
        page.extract_text() or "",
    )
    if not matches:
        raise ValueError("VAC chart date was not found")
    day, month, year = matches[-1]
    return f"{year}-{months[month]:02d}-{int(day):02d}"


def deduplicate_nearby_ticks(values: list[float]) -> list[float]:
    """Remove duplicate vector strokes without hiding a genuinely missing tick."""
    if len(values) < 3:
        return values
    gaps = [right - left for left, right in zip(values, values[1:]) if right - left >= 2]
    if not gaps:
        return values
    spacing = statistics.median(gaps)
    groups: list[list[float]] = []
    for value in values:
        if groups and value - groups[-1][-1] < spacing * 0.25:
            groups[-1].append(value)
        else:
            groups.append([value])
    result: list[float] = []
    for index, group in enumerate(groups):
        if len(group) == 1:
            result.append(group[0])
            continue
        previous = groups[index - 1][-1] if index > 0 else None
        following = groups[index + 1][0] if index + 1 < len(groups) else None
        def score(candidate: float) -> float:
            return (
                (0 if previous is None else abs(candidate - previous - spacing))
                + (0 if following is None else abs(following - candidate - spacing))
            )
        result.append(min(group, key=score))
    return result


def edge_ticks(page: pdfplumber.page.Page, frame: dict[str, float], edge: str) -> list[float]:
    result: list[float] = []
    # Some Avinor PDFs place the tick path a fraction of a PDF point inside
    # the filled chart-frame rectangle.
    tolerance = 0.3
    for line in page.lines:
        x0, x1 = float(line["x0"]), float(line["x1"])
        top, bottom = float(line["top"]), float(line["bottom"])
        width, height = abs(x1 - x0), abs(bottom - top)
        if edge == "top" and abs(top - frame["top"]) <= tolerance and width < 0.1 and 2.5 <= height <= 6:
            result.append((x0 + x1) / 2)
        elif edge == "bottom" and abs(bottom - frame["bottom"]) <= tolerance and width < 0.1 and 2.5 <= height <= 6:
            result.append((x0 + x1) / 2)
        elif edge == "left" and abs(x0 - frame["left"]) <= tolerance and height < 0.1 and 2.5 <= width <= 6:
            result.append((top + bottom) / 2)
        elif edge == "right" and abs(x1 - frame["right"]) <= tolerance and height < 0.1 and 2.5 <= width <= 6:
            result.append((top + bottom) / 2)
    return deduplicate_nearby_ticks(sorted(set(round(value, 6) for value in result)))


def horizontal_character_anchors(
    page: pdfplumber.page.Page, frame: dict[str, float], edge: str,
) -> list[tuple[float, float]]:
    expected_y = frame[edge]
    characters = [
        char for char in page.chars
        if frame["left"] - 20 <= float(char["x0"]) <= frame["right"] + 20
        and abs((float(char["top"]) + float(char["bottom"])) / 2 - expected_y) <= 10
        and str(char["text"]).strip()
    ]
    rows: list[list[dict[str, object]]] = []
    for char in sorted(characters, key=lambda item: (float(item["top"]), float(item["x0"]))):
        row = next((candidate for candidate in rows if abs(float(candidate[0]["top"]) - float(char["top"])) <= 0.75), None)
        if row is None:
            rows.append([char])
        else:
            row.append(char)
    anchors: list[tuple[float, float]] = []
    for row in rows:
        groups: list[list[dict[str, object]]] = []
        for char in sorted(row, key=lambda item: float(item["x0"])):
            if groups and float(char["x0"]) - float(groups[-1][-1]["x1"]) <= 1.75:
                groups[-1].append(char)
            else:
                groups.append([char])
        for group in groups:
            text = "".join(str(char["text"]) for char in group)
            value = parse_longitude(text)
            if value is not None:
                anchors.append(((float(group[0]["x0"]) + float(group[-1]["x1"])) / 2, value))
    return anchors


def labelled_anchors(page: pdfplumber.page.Page, frame: dict[str, float], edge: str) -> list[tuple[float, float]]:
    result: list[tuple[float, float]] = []
    for word in page.extract_words(use_text_flow=False, keep_blank_chars=False):
        centre_x = (float(word["x0"]) + float(word["x1"])) / 2
        centre_y = (float(word["top"]) + float(word["bottom"])) / 2
        text = str(word["text"])
        if edge in {"top", "bottom"}:
            value = parse_longitude(text)
            expected_y = frame[edge]
            if value is not None and abs(centre_y - expected_y) <= 8:
                result.append((centre_x, value))
        else:
            value = parse_latitude(text)
            expected_x = frame[edge]
            if value is not None and abs(centre_x - expected_x) <= 8:
                result.append((centre_y, value))
    if edge in {"top", "bottom"} and len(result) < 2:
        result.extend(horizontal_character_anchors(page, frame, edge))
    return sorted(set(result))


def minute_constraints(page: pdfplumber.page.Page, frame: dict[str, float], edge: str) -> list[dict[str, float | str]]:
    ticks = edge_ticks(page, frame, edge)
    anchors = labelled_anchors(page, frame, edge)
    if len(ticks) < 10 or len(anchors) < 2:
        raise ValueError(f"{edge} graticule has insufficient ticks or labels ({len(ticks)} ticks, {len(anchors)} labels)")
    matched: list[tuple[int, float]] = []
    for position, value in anchors:
        index = min(range(len(ticks)), key=lambda candidate: abs(ticks[candidate] - position))
        if abs(ticks[index] - position) > 1.5:
            raise ValueError(f"{edge} label cannot be matched to a major tick")
        matched.append((index, value))
    direction = 1 if edge in {"top", "bottom"} else -1
    offsets = [value - direction * index / 60 for index, value in matched]
    offset = float(numpy.median(offsets))
    label_errors_minutes = [abs((offset + direction * index / 60) - value) * 60 for index, value in matched]
    if max(label_errors_minutes) > 0.02:
        raise ValueError(f"{edge} labelled graticule is ambiguous ({max(label_errors_minutes):.3f} minute mismatch)")
    result = []
    for index, position in enumerate(ticks):
        result.append({
            "edge": edge,
            "axis": "longitude" if edge in {"top", "bottom"} else "latitude",
            "sourcePointX": position if edge in {"top", "bottom"} else frame[edge],
            "sourcePointY": frame[edge] if edge in {"top", "bottom"} else position,
            "value": offset + direction * index / 60,
        })
    return result


def terms(x: float, y: float, frame: dict[str, float], axis: str) -> list[float]:
    nx = (x - frame["left"]) / (frame["right"] - frame["left"])
    ny = (y - frame["top"]) / (frame["bottom"] - frame["top"])
    # Longitude is constrained on two horizontal edges, so y squared is not
    # independently observable. Latitude is constrained on two vertical edges,
    # so x squared is not independently observable. The remaining cross-axis
    # curvature terms model the chart's meridian convergence without pretending
    # the published frame contains information that it does not.
    return [1, nx, ny, nx * nx, nx * ny] if axis == "longitude" else [1, nx, ny, nx * ny, ny * ny]


def fit_model(constraints: list[dict[str, float | str]], frame: dict[str, float], axis: str) -> numpy.ndarray:
    matrix = numpy.array([terms(float(item["sourcePointX"]), float(item["sourcePointY"]), frame, axis) for item in constraints])
    values = numpy.array([float(item["value"]) for item in constraints])
    coefficients, _, rank, _ = numpy.linalg.lstsq(matrix, values, rcond=None)
    if rank < 5:
        raise ValueError("Published graticule controls do not span a second-order model")
    return coefficients


def predict(coefficients: numpy.ndarray, x: float, y: float, frame: dict[str, float], axis: str) -> float:
    return float(numpy.dot(numpy.array(terms(x, y, frame, axis)), coefficients))


def split_constraints(items: list[dict[str, float | str]]) -> tuple[list[dict[str, float | str]], list[dict[str, float | str]]]:
    by_edge: dict[str, list[dict[str, float | str]]] = {}
    for item in items:
        by_edge.setdefault(str(item["edge"]), []).append(item)
    fit: list[dict[str, float | str]] = []
    validation: list[dict[str, float | str]] = []
    for edge in sorted(by_edge):
        ordered = by_edge[edge]
        # Fixed quartile holdouts are selected by position, never by residual.
        indexes = {round((len(ordered) - 1) * fraction) for fraction in (0.25, 0.75)}
        fit.extend(item for index, item in enumerate(ordered) if index not in indexes)
        validation.extend(item for index, item in enumerate(ordered) if index in indexes)
    return fit, validation


def point(label: str, x: float, y: float, latitude: float, longitude: float, note: str) -> dict[str, object]:
    return {
        "label": label, "sourcePointX": round(x, 6), "sourcePointY": round(y, 6),
        "latitude": round(latitude, 10), "longitude": round(longitude, 10), "reviewNote": note,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--icao", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--chart-date")
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--output")
    options = parser.parse_args()
    pdf_path = Path(options.pdf)
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[0]
        frame = chart_frame(page)
        constraints = [item for edge in ("top", "bottom", "left", "right") for item in minute_constraints(page, frame, edge)]
        published_chart_date = chart_date(page)
    longitude = [item for item in constraints if item["axis"] == "longitude"]
    latitude = [item for item in constraints if item["axis"] == "latitude"]
    longitude_fit, longitude_validation = split_constraints(longitude)
    latitude_fit, latitude_validation = split_constraints(latitude)
    longitude_model = fit_model(longitude_fit, frame, "longitude")
    latitude_model = fit_model(latitude_fit, frame, "latitude")
    fit_points = []
    for row, y_fraction in enumerate((0.0, 1 / 3, 2 / 3, 1.0)):
        for column, x_fraction in enumerate((0.0, 1 / 3, 2 / 3, 1.0)):
            x = frame["left"] + x_fraction * (frame["right"] - frame["left"])
            y = frame["top"] + y_fraction * (frame["bottom"] - frame["top"])
            fit_points.append(point(
                f"GRATICULE-GRID-{row + 1}-{column + 1}", x, y,
                predict(latitude_model, x, y, frame, "latitude"), predict(longitude_model, x, y, frame, "longitude"),
                "Coordinate pair calculated from independently fitted published VAC latitude and longitude graticule ticks.",
            ))
    validation_points = []
    for index, item in enumerate(longitude_validation):
        x, y = float(item["sourcePointX"]), float(item["sourcePointY"])
        validation_points.append(point(
            f"HELD-OUT-{str(item['edge']).upper()}-LON-{index + 1}", x, y,
            predict(latitude_model, x, y, frame, "latitude"), float(item["value"]),
            "Longitude is a deterministically held-out published VAC graticule tick; latitude is calculated from the independently fitted latitude graticule.",
        ))
    for index, item in enumerate(latitude_validation):
        x, y = float(item["sourcePointX"]), float(item["sourcePointY"])
        validation_points.append(point(
            f"HELD-OUT-{str(item['edge']).upper()}-LAT-{index + 1}", x, y,
            float(item["value"]), predict(longitude_model, x, y, frame, "longitude"),
            "Latitude is a deterministically held-out published VAC graticule tick; longitude is calculated from the independently fitted longitude graticule.",
        ))
    output = {
        "icao": options.icao.upper(), "title": options.title, "chartDate": options.chart_date or published_chart_date,
        "sourceUrl": options.source_url,
        "sourcePdfSha256": hashlib.sha256(pdf_path.read_bytes()).hexdigest(), "page": 1,
        "cropPdfPoints": frame, "transformOrder": 2, "minimumControlSpanFraction": 0.95,
        "graticuleControl": {
            "method": "published-edge-graticule-second-order",
            "longitudeFitTickCount": len(longitude_fit), "latitudeFitTickCount": len(latitude_fit),
            "longitudeCoefficients": [round(float(value), 12) for value in longitude_model],
            "latitudeCoefficients": [round(float(value), 12) for value in latitude_model],
            "validationTicks": [
                {
                    "edge": item["edge"], "axis": item["axis"],
                    "sourcePointX": round(float(item["sourcePointX"]), 6),
                    "sourcePointY": round(float(item["sourcePointY"]), 6),
                    "value": round(float(item["value"]), 10),
                }
                for item in longitude_validation + latitude_validation
            ],
        },
    }
    contents = json.dumps(output, ensure_ascii=False, indent=2) + "\n"
    if options.output:
        Path(options.output).write_text(contents, encoding="utf-8")
    else:
        print(contents, end="")


if __name__ == "__main__":
    main()
