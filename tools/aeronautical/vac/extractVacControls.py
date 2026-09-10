"""Extract review candidates from vector Avinor VAC PDFs.

This helper never publishes data. It reports PDF-point triangle centroids that
can be compared with the separately extracted, published VAC coordinate table.
Its output is an input to human review, not an aviation-data source by itself.
"""

from __future__ import annotations

import argparse
import itertools
import json
import random
import re
import unicodedata
from pathlib import Path

import pdfplumber
import numpy


def normalized(value: str) -> str:
    value = value.upper().replace("�", "?")
    value = "".join(
        character
        for character in unicodedata.normalize("NFKD", value)
        if not unicodedata.combining(character)
    )
    return re.sub(r"[^A-Z0-9?]", "", value)


def wildcard_match(expected: str, actual: str) -> bool:
    expected_value = normalized(expected)
    actual_value = normalized(actual)
    if len(expected_value) != len(actual_value):
        return False
    return all(
        expected_character == actual_character or actual_character == "?"
        for expected_character, actual_character in zip(expected_value, actual_value)
    )


def black(value: object) -> bool:
    if value == 0:
        return True
    return isinstance(value, tuple) and len(value) >= 3 and all(float(channel) <= 0.02 for channel in value[:3])


def reporting_triangles(page: pdfplumber.page.Page, frame: dict[str, float]) -> list[dict[str, float]]:
    result = []
    for curve in page.curves:
        points = curve.get("pts") or []
        is_black_symbol = (
            curve.get("fill") and black(curve.get("non_stroking_color"))
        ) or (
            curve.get("stroke") and black(curve.get("stroking_color"))
        )
        if not is_black_symbol or len(points) != 4:
            continue
        width = float(curve["width"])
        height = float(curve["height"])
        if not (6 <= width <= 12 and 5 <= height <= 11):
            continue
        if not (
            frame["x0"] <= curve["x0"] <= curve["x1"] <= frame["x1"]
            and frame["top"] <= curve["top"] <= curve["bottom"] <= frame["bottom"]
        ):
            continue
        unique = points[:-1] if points[0] == points[-1] else points
        candidate = {
            "sourcePointX": sum(float(point[0]) for point in unique) / len(unique),
            "sourcePointY": sum(float(point[1]) for point in unique) / len(unique),
        }
        if not any(
            abs(candidate["sourcePointX"] - current["sourcePointX"]) < 0.05
            and abs(candidate["sourcePointY"] - current["sourcePointY"]) < 0.05
            for current in result
        ):
            result.append(candidate)
    return result


def chart_frame(page: pdfplumber.page.Page) -> dict[str, float]:
    candidates = [
        rectangle for rectangle in page.rects
        if 400 <= rectangle["width"] <= 520 and 400 <= rectangle["height"] <= 620
    ]
    if not candidates:
        raise ValueError("No VAC plan-view frame was found")
    rectangle = max(candidates, key=lambda item: item["width"] * item["height"])
    return {
        "x0": float(rectangle["x0"]),
        "top": float(rectangle["top"]),
        "x1": float(rectangle["x1"]),
        "bottom": float(rectangle["bottom"]),
    }


def match_points(page: pdfplumber.page.Page, frame: dict[str, float], names: list[str]) -> list[dict[str, object]]:
    triangles = reporting_triangles(page, frame)
    words = [
        word for word in page.extract_words(use_text_flow=False, keep_blank_chars=False)
        if frame["x0"] <= word["x0"] <= word["x1"] <= frame["x1"]
        and frame["top"] <= word["top"] <= word["bottom"] <= frame["bottom"]
    ]
    matches = []
    used_triangles: set[int] = set()
    for name in names:
        labels = [word for word in words if wildcard_match(name, str(word["text"]))]
        candidates = []
        for label in labels:
            label_x = (float(label["x0"]) + float(label["x1"])) / 2
            label_y = (float(label["top"]) + float(label["bottom"])) / 2
            for index, triangle in enumerate(triangles):
                if index in used_triangles:
                    continue
                dx = float(triangle["sourcePointX"]) - label_x
                dy = float(triangle["sourcePointY"]) - label_y
                distance = (dx * dx + dy * dy) ** 0.5
                if distance <= 55:
                    candidates.append((distance, index, triangle, label))
        if not candidates:
            matches.append({"name": name, "error": "no nearby labelled reporting-point triangle"})
            continue
        _, triangle_index, triangle, label = min(candidates, key=lambda item: item[0])
        used_triangles.add(triangle_index)
        matches.append({
            "name": name,
            **triangle,
            "matchedLabel": label["text"],
            "labelX": (float(label["x0"]) + float(label["x1"])) / 2,
            "labelY": (float(label["top"]) + float(label["bottom"])) / 2,
        })
    return matches


def dms(value: str) -> float:
    match = re.fullmatch(r"(\d{2,3})(\d{2})(\d{2})([NSEW])", value)
    if not match:
        raise ValueError(f"Malformed published coordinate: {value}")
    degrees, minutes, seconds, hemisphere = match.groups()
    result = int(degrees) + int(minutes) / 60 + int(seconds) / 3600
    return -result if hemisphere in {"S", "W"} else result


def geometric_matches(
    triangles: list[dict[str, float]],
    published_points: list[dict[str, str]],
) -> list[dict[str, object]]:
    if len(triangles) < 6:
        return [{"name": point["name"], "error": "fewer than six reporting-point triangles"} for point in published_points]
    geographic = numpy.array([
        [dms(point["longitudeDms"]), dms(point["latitudeDms"]), 1.0]
        for point in published_points
    ])
    pixels = numpy.array([[point["sourcePointX"], point["sourcePointY"]] for point in triangles])
    randomizer = random.Random(20260909)
    best: tuple[int, float, numpy.ndarray] | None = None
    trials = min(30000, max(6000, len(published_points) * len(triangles) * 150))
    for _ in range(trials):
        geographic_indexes = randomizer.sample(range(len(geographic)), 3)
        pixel_indexes = randomizer.sample(range(len(pixels)), 3)
        source = geographic[geographic_indexes]
        if abs(numpy.linalg.det(source)) < 1e-8:
            continue
        for target_order in itertools.permutations(pixel_indexes):
            transform = numpy.linalg.solve(source, pixels[list(target_order)])
            # VAC plan views are north-up: east is right and north is up.
            if transform[0, 0] <= 0 or transform[1, 1] >= 0:
                continue
            predicted = geographic @ transform
            distances = numpy.linalg.norm(predicted[:, None, :] - pixels[None, :, :], axis=2)
            candidate_pairs = sorted(
                (float(distances[g, p]), g, p)
                for g in range(len(geographic))
                for p in range(len(pixels))
                if distances[g, p] <= 18
            )
            used_geographic: set[int] = set()
            used_pixels: set[int] = set()
            total = 0.0
            for distance, geographic_index, pixel_index in candidate_pairs:
                if geographic_index in used_geographic or pixel_index in used_pixels:
                    continue
                used_geographic.add(geographic_index)
                used_pixels.add(pixel_index)
                total += distance
            score = (len(used_geographic), -total)
            if best is None or score > (best[0], -best[1]):
                best = (score[0], total, transform)
    if best is None:
        return [{"name": point["name"], "error": "no north-up geometric match"} for point in published_points]

    transform = best[2]
    assignments: list[tuple[int, int]] = []
    for _ in range(4):
        predicted = geographic @ transform
        distances = numpy.linalg.norm(predicted[:, None, :] - pixels[None, :, :], axis=2)
        pairs = sorted(
            (float(distances[g, p]), g, p)
            for g in range(len(geographic))
            for p in range(len(pixels))
            if distances[g, p] <= 18
        )
        assignments = []
        used_geographic: set[int] = set()
        used_pixels: set[int] = set()
        for _, geographic_index, pixel_index in pairs:
            if geographic_index in used_geographic or pixel_index in used_pixels:
                continue
            used_geographic.add(geographic_index)
            used_pixels.add(pixel_index)
            assignments.append((geographic_index, pixel_index))
        if len(assignments) < 3:
            break
        transform = numpy.linalg.lstsq(
            geographic[[geographic_index for geographic_index, _ in assignments]],
            pixels[[pixel_index for _, pixel_index in assignments]],
            rcond=None,
        )[0]

    by_geographic = {geographic_index: pixel_index for geographic_index, pixel_index in assignments}
    result = []
    for index, point in enumerate(published_points):
        pixel_index = by_geographic.get(index)
        if pixel_index is None:
            result.append({**point, "error": "published point is not unambiguously plotted"})
        else:
            result.append({**point, **triangles[pixel_index]})
    return result


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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", required=True)
    parser.add_argument("--downloads", required=True)
    parser.add_argument("--output")
    options = parser.parse_args()
    catalog = json.loads(Path(options.catalog).read_text(encoding="utf-8"))
    downloads = json.loads(Path(options.downloads).read_text(encoding="utf-8"))
    downloads_by_key = {(entry["icao"], Path(entry["file"]).stem.split("-", 1)[1]): entry for entry in downloads}
    output = []
    for chart in catalog["charts"]:
        if len(chart["points"]) < 5:
            continue
        graphic_id = Path(chart["sourceUrl"]).stem
        download = downloads_by_key.get((chart["aerodromeIdentifier"], graphic_id))
        if download is None:
            output.append({"icao": chart["aerodromeIdentifier"], "graphicId": graphic_id, "error": "PDF was not downloaded"})
            continue
        with pdfplumber.open(download["file"]) as pdf:
            page = pdf.pages[int(chart.get("sourcePage", "1")) - 1]
            frame = chart_frame(page)
            triangles = reporting_triangles(page, frame)
            points = geometric_matches(triangles, chart["points"])
            output.append({
                "icao": chart["aerodromeIdentifier"],
                "graphicId": graphic_id,
                "sourceUrl": download["url"],
                "sourcePdfSha256": download["sha256"],
                "chartDate": chart_date(page),
                "page": int(chart.get("sourcePage", "1")),
                "cropPdfPoints": {
                    "left": frame["x0"], "top": frame["top"],
                    "right": frame["x1"], "bottom": frame["bottom"],
                },
                "triangleCount": len(triangles),
                "points": points,
            })
    contents = json.dumps(output, ensure_ascii=False, indent=2) + "\n"
    if options.output:
        Path(options.output).write_text(contents, encoding="utf-8")
    else:
        print(contents, end="")


if __name__ == "__main__":
    main()
