import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import type { NormalizedAeronauticalDataset } from '../../../src/aeronautical/normalizedDataset';
import { validateProductionVacChartManifest } from '../../../src/aeronautical/vacManifest';
import type { Position, VacChartGroundControlPoint, VacChartManifest, Wgs84Bounds } from '../../../src/domain';
import { NORWAY_EAIP_EDITION } from '../avinor-eaip/edition';
import { parsePublishedDms, validateVacPreparationConfig } from './config';
import { requireVacTools, runCommand } from './externalTools';
import type { VacPointResidual, VacPreparationConfig, VacPreparationPoint, VacPreparationReport } from './types';
import { calculateVacValidationMetrics, geodesicErrorMeters } from './validationMetrics';

const ROOT = resolve(import.meta.dirname, '../../..');
const APPROVED_DATASET = resolve(ROOT, `src/aeronautical/data/${NORWAY_EAIP_EDITION.datasetId}.json`);

export interface PrepareVacOptions {
  readonly sourcePdfPath?: string;
  readonly activate: boolean;
}

export interface PreparedVacResult {
  readonly manifest: VacChartManifest;
  readonly report: VacPreparationReport;
  readonly manifestPath: string;
  readonly reportPath: string;
  readonly tileDirectory: string;
  readonly activated: boolean;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function assertVacSourceHash(bytes: Uint8Array, expectedHash: string): void {
  const actualHash = sha256(bytes);
  if (actualHash !== expectedHash) {
    throw new Error(`VAC source hash mismatch: expected ${expectedHash}, received ${actualHash}. No output was published.`);
  }
}

async function atomicWrite(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, contents, 'utf8');
  await rename(temporary, path);
}

async function fetchSourcePdf(config: VacPreparationConfig, localPath?: string): Promise<{ bytes: Buffer; retrievedAtUtc: string }> {
  if (localPath !== undefined) return { bytes: await readFile(resolve(localPath)), retrievedAtUtc: new Date().toISOString() };
  const response = await fetch(config.sourceUrl, {
    headers: { accept: 'application/pdf', 'user-agent': 'FlightPlanner-VAC-Preparer/1.0' },
  });
  if (!response.ok) throw new Error(`VAC PDF download failed: ${response.status} ${response.statusText}`);
  return { bytes: Buffer.from(await response.arrayBuffer()), retrievedAtUtc: new Date().toISOString() };
}

export function calculateCropPixelGeometry(config: VacPreparationConfig) {
  const scale = config.renderDpi / 72;
  const left = Math.round(config.cropPdfPoints.left * scale);
  const top = Math.round(config.cropPdfPoints.top * scale);
  const right = Math.round(config.cropPdfPoints.right * scale);
  const bottom = Math.round(config.cropPdfPoints.bottom * scale);
  return { scale, left, top, width: right - left, height: bottom - top };
}

function pointPosition(point: VacPreparationPoint): Position {
  return {
    latitude: parsePublishedDms(point.publishedLatitude),
    longitude: parsePublishedDms(point.publishedLongitude),
  };
}

export function pdfPointToCroppedPixel(
  point: Pick<VacPreparationPoint, 'sourcePointX' | 'sourcePointY'>,
  crop: ReturnType<typeof calculateCropPixelGeometry>,
) {
  return {
    pixelX: point.sourcePointX * crop.scale - crop.left,
    pixelY: point.sourcePointY * crop.scale - crop.top,
  };
}

function retainedControlPoint(point: VacPreparationPoint, crop: ReturnType<typeof calculateCropPixelGeometry>): VacChartGroundControlPoint {
  return { label: point.label, reviewNote: point.reviewNote, ...pdfPointToCroppedPixel(point, crop), ...pointPosition(point) };
}

function parseTransformLine(output: string, label: string): readonly [number, number] {
  const fields = output.trim().split(/\s+/).map(Number);
  if (fields.length < 2 || !Number.isFinite(fields[0]) || !Number.isFinite(fields[1])) {
    throw new Error(`GDAL returned malformed transform output for ${label}: ${output}`);
  }
  return [fields[0]!, fields[1]!];
}

async function validateHoldoutPoints(
  config: VacPreparationConfig,
  crop: ReturnType<typeof calculateCropPixelGeometry>,
  gcpDatasetPath: string,
): Promise<readonly VacPointResidual[]> {
  const residuals: VacPointResidual[] = [];
  for (const point of config.validationPoints) {
    const expected = pointPosition(point);
    const expectedPixels = pdfPointToCroppedPixel(point, crop);
    const forward = await runCommand('gdaltransform', [
      '-order', String(config.transformOrder), gcpDatasetPath,
    ], { stdin: `${expectedPixels.pixelX} ${expectedPixels.pixelY} 0\n` });
    const [predictedLongitude, predictedLatitude] = parseTransformLine(forward.stdout, point.label);
    const inverse = await runCommand('gdaltransform', [
      '-i', '-order', String(config.transformOrder), gcpDatasetPath,
    ], { stdin: `${expected.longitude} ${expected.latitude} 0\n` });
    const [predictedPixelX, predictedPixelY] = parseTransformLine(inverse.stdout, point.label);
    residuals.push({
      label: point.label,
      horizontalErrorMeters: geodesicErrorMeters(expected, { latitude: predictedLatitude, longitude: predictedLongitude }),
      pixelError: Math.hypot(predictedPixelX - expectedPixels.pixelX, predictedPixelY - expectedPixels.pixelY),
      predictedLatitude,
      predictedLongitude,
    });
  }
  return residuals;
}

function parseWgs84Bounds(gdalInfo: unknown): Wgs84Bounds {
  const coordinates = (gdalInfo as { wgs84Extent?: { coordinates?: unknown } }).wgs84Extent?.coordinates;
  if (!Array.isArray(coordinates)) throw new Error('gdalinfo did not return a WGS84 extent');
  const positions: number[][] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      positions.push([value[0], value[1]]);
    } else if (Array.isArray(value)) value.forEach(visit);
  };
  visit(coordinates);
  if (positions.length === 0) throw new Error('gdalinfo WGS84 extent contains no coordinates');
  return {
    west: Math.min(...positions.map(([longitude]) => longitude!)),
    east: Math.max(...positions.map(([longitude]) => longitude!)),
    south: Math.min(...positions.map(([, latitude]) => latitude!)),
    north: Math.max(...positions.map(([, latitude]) => latitude!)),
  };
}

async function directoryStats(path: string): Promise<{ count: number; bytes: number; digest: string }> {
  const hash = createHash('sha256');
  let count = 0;
  let bytes = 0;
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else {
        const contents = await readFile(fullPath);
        hash.update(fullPath.slice(path.length).replaceAll('\\', '/'));
        hash.update(contents);
        count += 1;
        bytes += contents.byteLength;
      }
    }
  };
  await visit(path);
  return { count, bytes, digest: hash.digest('hex') };
}

async function publishTileDirectory(staged: string, destination: string): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  try {
    await access(destination);
    const [current, candidate] = await Promise.all([directoryStats(destination), directoryStats(staged)]);
    if (current.digest !== candidate.digest) {
      throw new Error(`Prepared VAC tile directory already exists with different contents: ${destination}`);
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await rename(staged, destination);
  }
}

function renderMarkdownReport(report: VacPreparationReport): string {
  const controlRows = report.fitPoints.map((point) =>
    `| ${point.label ?? '—'} | ${point.pixelX.toFixed(2)} | ${point.pixelY.toFixed(2)} | ${point.latitude.toFixed(6)} | ${point.longitude.toFixed(6)} |`,
  ).join('\n');
  const validationPoints = new Map(report.validationPoints.map((point) => [point.label, point]));
  const rows = report.validation.residuals.map((residual) => {
    const point = validationPoints.get(residual.label);
    return `| ${residual.label} | ${point?.pixelX.toFixed(2) ?? '—'} | ${point?.pixelY.toFixed(2) ?? '—'} | ${point?.latitude.toFixed(6) ?? '—'} | ${point?.longitude.toFixed(6) ?? '—'} | ${residual.horizontalErrorMeters.toFixed(1)} | ${residual.pixelError.toFixed(2)} |`;
  }).join('\n');
  return `# VAC preparation: ${report.chartId}\n\n` +
    `- Source: [${report.sourcePdfFilename}](${report.sourceUrl})\n` +
    `- Source SHA-256: \`${report.sourcePdfSha256}\`\n` +
    `- Source file: \`${report.sourcePdfFilename}\`, page ${report.sourcePage}\n` +
    `- Render: ${report.renderDpi} DPI\n` +
    `- Target CRS: ${report.targetCrs}\n` +
    `- Transform: ${report.transform}\n` +
    `- Independent validation: ${report.validation.validationPointCount} points\n` +
    `- RMS: ${report.validation.residualRmsMeters.toFixed(1)} m / ${report.validation.residualRmsPixels.toFixed(2)} px\n` +
    `- Maximum: ${report.validation.maximumResidualMeters.toFixed(1)} m / ${report.validation.maximumResidualPixels.toFixed(2)} px\n` +
    `- Gate: RMS <= ${report.thresholds.maximumRmsMeters} m; maximum <= ${report.thresholds.maximumErrorMeters} m\n` +
    `- Result: **${report.passed ? 'PASS' : 'FAIL'}**\n` +
    `- Bounds: ${report.bounds.south.toFixed(7)}, ${report.bounds.west.toFixed(7)} to ${report.bounds.north.toFixed(7)}, ${report.bounds.east.toFixed(7)}\n` +
    `- Tiles: ${report.tileCount} files, ${report.tileBytes} bytes\n\n` +
    `- Tile output: \`${report.outputTileDirectory}\`\n\n` +
    `## Fit control points\n\n| Point | Pixel X | Pixel Y | Latitude | Longitude |\n| --- | ---: | ---: | ---: | ---: |\n${controlRows}\n\n` +
    `## Independent validation residuals\n\n` +
    `| Holdout point | Pixel X | Pixel Y | Latitude | Longitude | Error (m) | Error (px) |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: |\n${rows}\n`;
}

async function activateManifest(manifest: VacChartManifest): Promise<void> {
  const dataset = JSON.parse(await readFile(APPROVED_DATASET, 'utf8')) as NormalizedAeronauticalDataset;
  if (!dataset.features.some(({ ref }) => ref.featureId === manifest.aerodromeFeatureId)) {
    throw new Error(`Cannot activate VAC: dataset does not contain ${manifest.aerodromeFeatureId}`);
  }
  const nextCharts = [...dataset.vacCharts.filter(({ id }) => id !== manifest.id), manifest]
    .sort((a, b) => a.id.localeCompare(b.id));
  await atomicWrite(APPROVED_DATASET, `${JSON.stringify({ ...dataset, vacCharts: nextCharts }, null, 2)}\n`);
}

export async function prepareVac(
  uncheckedConfig: VacPreparationConfig,
  options: PrepareVacOptions,
): Promise<PreparedVacResult> {
  const config = validateVacPreparationConfig(uncheckedConfig);
  const tools = await requireVacTools();
  const acquired = await fetchSourcePdf(config, options.sourcePdfPath);
  const source = acquired.bytes;
  assertVacSourceHash(source, config.sourcePdfSha256);

  const stagingRoot = await mkdtemp(join(tmpdir(), 'flight-planner-vac-'));
  try {
    const sourcePdf = join(stagingRoot, 'source.pdf');
    const renderPrefix = join(stagingRoot, 'render');
    const renderPng = `${renderPrefix}.png`;
    const croppedPng = join(stagingRoot, 'cropped.png');
    const gcpVrt = join(stagingRoot, 'controlled.vrt');
    const warpedTiff = join(stagingRoot, 'warped-3857.tif');
    const stagedTiles = join(stagingRoot, 'tiles');
    await writeFile(sourcePdf, source);
    await runCommand('pdftoppm', [
      '-f', String(config.page), '-l', String(config.page), '-singlefile',
      '-r', String(config.renderDpi), '-png', sourcePdf, renderPrefix,
    ]);
    const crop = calculateCropPixelGeometry(config);
    await runCommand('gdal_translate', [
      '-srcwin', String(crop.left), String(crop.top), String(crop.width), String(crop.height),
      renderPng, croppedPng,
    ]);
    const gcpArgs = config.fitPoints.flatMap((point) => {
      const pixels = pdfPointToCroppedPixel(point, crop);
      const position = pointPosition(point);
      return ['-gcp', String(pixels.pixelX), String(pixels.pixelY), String(position.longitude), String(position.latitude)];
    });
    await runCommand('gdal_translate', [
      '-of', 'VRT', '-a_srs', 'EPSG:4326', ...gcpArgs, croppedPng, gcpVrt,
    ]);
    const residuals = await validateHoldoutPoints(config, crop, gcpVrt);
    const metrics = calculateVacValidationMetrics(residuals, config.fitPoints.length);
    const passed = metrics.residualRmsMeters <= config.qualityThresholds.maximumRmsMeters &&
      metrics.maximumResidualMeters <= config.qualityThresholds.maximumErrorMeters;
    if (!passed) {
      throw new Error(
        `VAC validation failed: RMS ${metrics.residualRmsMeters.toFixed(1)} m (limit ${config.qualityThresholds.maximumRmsMeters}), ` +
        `maximum ${metrics.maximumResidualMeters.toFixed(1)} m (limit ${config.qualityThresholds.maximumErrorMeters}). No output was published.`,
      );
    }
    await runCommand('gdalwarp', [
      '-overwrite', '-order', String(config.transformOrder), '-t_srs', 'EPSG:3857',
      '-r', 'cubic', '-dstalpha', '-co', 'TILED=YES', '-co', 'COMPRESS=DEFLATE',
      gcpVrt, warpedTiff,
    ]);
    const info = await runCommand('gdalinfo', ['-json', warpedTiff]);
    const bounds = parseWgs84Bounds(JSON.parse(info.stdout));
    await runCommand('gdal', [
      'raster', 'tile', '--tiling-scheme', 'WebMercatorQuad', '--convention', 'xyz',
      '--min-zoom', String(config.minimumZoom), '--max-zoom', String(config.maximumZoom),
      '--format', 'PNG', '--co', 'ZLEVEL=9', '--add-alpha', '--skip-blank',
      '--webviewer', 'none', warpedTiff, stagedTiles,
    ]);
    const tileStats = await directoryStats(stagedTiles);
    if (tileStats.count === 0) throw new Error('VAC preparation produced no tiles');

    const identity = `${config.chartDate}-${config.sourcePdfSha256.slice(0, 8)}-r${config.preparationRevision}`;
    const relativeTiles = `aeronautical/vac/${config.icao.toLowerCase()}/${identity}`;
    const manifest: VacChartManifest = {
      id: config.id,
      aerodromeFeatureId: config.aerodromeFeatureId,
      title: config.title,
      chartDate: config.chartDate,
      sourcePdfSha256: config.sourcePdfSha256,
      tileUrlTemplate: `${relativeTiles}/{z}/{x}/{y}.png`,
      targetCrs: 'EPSG:3857',
      bounds,
      minimumZoom: config.minimumZoom,
      maximumZoom: config.maximumZoom,
      defaultOpacity: config.defaultOpacity,
      groundControlPoints: config.fitPoints.map((point) => retainedControlPoint(point, crop)),
      validation: {
        residualRmsPixels: metrics.residualRmsPixels,
        maximumResidualPixels: metrics.maximumResidualPixels,
        residualRmsMeters: metrics.residualRmsMeters,
        maximumResidualMeters: metrics.maximumResidualMeters,
        fitPointCount: metrics.fitPointCount,
        validationPointCount: metrics.validationPointCount,
        qualityThresholds: config.qualityThresholds,
      },
      sourceReferences: [
        ...config.sourceReferences,
        {
          sourceType: 'prepared-vac',
          sourceAerodrome: config.icao,
          sourceDocument: `${config.icao} VAC preparation report`,
          aipSection: `AD 2 ${config.icao} 6-1`,
          sourceReference: `data/aeronautical/vac/${config.icao}-${identity}-preparation.json`,
        },
      ],
    };
    const manifestErrors = validateProductionVacChartManifest(manifest);
    if (manifestErrors.length > 0) throw new Error(`Prepared VAC manifest is invalid:\n- ${manifestErrors.join('\n- ')}`);
    const report: VacPreparationReport = {
      reportVersion: 1,
      preparationTool: { name: 'flight-planner-vac-preparer', version: 1 },
      configVersion: config.configVersion,
      preparationRevision: config.preparationRevision,
      chartId: config.id,
      sourceUrl: config.sourceUrl,
      sourcePdfFilename: basename(new URL(config.sourceUrl).pathname),
      sourcePdfSha256: config.sourcePdfSha256,
      retrievedAtUtc: acquired.retrievedAtUtc,
      preparedAtUtc: new Date().toISOString(),
      sourcePage: config.page,
      renderDpi: config.renderDpi,
      cropPixels: { left: crop.left, top: crop.top, width: crop.width, height: crop.height },
      tools,
      targetCrs: 'EPSG:3857',
      transform: `second-order polynomial (${config.fitPoints.length} fit points; ${config.validationPoints.length} independent holdouts)`,
      bounds,
      tileCount: tileStats.count,
      tileBytes: tileStats.bytes,
      tileUrlTemplate: manifest.tileUrlTemplate,
      outputTileDirectory: `public/${relativeTiles}`,
      validation: metrics,
      fitPoints: config.fitPoints.map((point) => retainedControlPoint(point, crop)),
      validationPoints: config.validationPoints.map((point) => retainedControlPoint(point, crop)),
      thresholds: config.qualityThresholds,
      passed,
    };

    const tileDirectory = resolve(ROOT, 'public', relativeTiles);
    const manifestPath = resolve(ROOT, `data/aeronautical/vac/${config.icao}-${identity}-manifest.json`);
    const reportPath = resolve(ROOT, `data/aeronautical/vac/${config.icao}-${identity}-preparation.json`);
    await publishTileDirectory(stagedTiles, tileDirectory);
    await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await atomicWrite(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    await atomicWrite(reportPath.replace(/\.json$/, '.md'), renderMarkdownReport(report));
    if (options.activate) await activateManifest(manifest);
    return { manifest, report, manifestPath, reportPath, tileDirectory, activated: options.activate };
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}
