import { ENDU_VAC_PREPARATION } from './prepared/endu';
import { NATIONAL_VAC_PREPARATIONS } from './prepared/national';
import { activateVacManifests, prepareVac } from './prepareVac';
import { basename, resolve } from 'node:path';
import { access, readFile } from 'node:fs/promises';
import type { VacChartManifest } from '../../../src/domain';
import { validateProductionVacChartManifest } from '../../../src/aeronautical/vacManifest';

interface CliOptions {
  readonly icao?: string;
  readonly allReviewed: boolean;
  readonly sourcePdfPath?: string;
  readonly sourceDirectory?: string;
  readonly activate: boolean;
  readonly activatePrepared: boolean;
}

function parseArgs(args: readonly string[]): CliOptions {
  let icao: string | undefined;
  let allReviewed = false;
  let sourcePdfPath: string | undefined;
  let sourceDirectory: string | undefined;
  let activate = false;
  let activatePrepared = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') continue;
    if (arg === '--icao') icao = args[++index];
    else if (arg === '--all-reviewed') allReviewed = true;
    else if (arg === '--source-pdf') sourcePdfPath = args[++index];
    else if (arg === '--source-directory') sourceDirectory = args[++index];
    else if (arg === '--activate') activate = true;
    else if (arg === '--activate-prepared') activatePrepared = true;
    else throw new Error(`Unknown VAC preparation option: ${String(arg)}`);
  }
  if ((icao === undefined) === !allReviewed) {
    throw new Error('Specify exactly one of --icao ICAO or --all-reviewed');
  }
  if (sourcePdfPath !== undefined && allReviewed) throw new Error('--source-pdf is only valid with --icao');
  if (sourcePdfPath !== undefined && sourceDirectory !== undefined) throw new Error('Specify only one source PDF input');
  if (activatePrepared && activate) throw new Error('--activate-prepared must not be combined with --activate');
  if (activatePrepared && (sourcePdfPath !== undefined || sourceDirectory !== undefined)) {
    throw new Error('--activate-prepared does not accept a source PDF or source directory');
  }
  return {
    ...(icao === undefined ? {} : { icao: icao.toUpperCase() }),
    allReviewed,
    ...(sourcePdfPath === undefined ? {} : { sourcePdfPath }),
    ...(sourceDirectory === undefined ? {} : { sourceDirectory }),
    activate, activatePrepared,
  };
}

const options = parseArgs(process.argv.slice(2));
const configs = [ENDU_VAC_PREPARATION, ...NATIONAL_VAC_PREPARATIONS];
const selected = options.allReviewed
  ? NATIONAL_VAC_PREPARATIONS
  : configs.filter((config) => config.icao === options.icao);
if (selected.length === 0) throw new Error(`No reviewed VAC preparation config exists for ${options.icao}`);

const root = resolve(import.meta.dirname, '../../..');
if (options.activatePrepared) {
  const manifests: VacChartManifest[] = [];
  for (const config of selected) {
    const identity = `${config.chartDate}-${config.sourcePdfSha256.slice(0, 8)}-r${config.preparationRevision}`;
    const manifestPath = resolve(root, `data/aeronautical/vac/${config.icao}-${identity}-manifest.json`);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as VacChartManifest;
    const errors = validateProductionVacChartManifest(manifest);
    if (errors.length > 0) throw new Error(`Prepared manifest ${manifestPath} is invalid:\n- ${errors.join('\n- ')}`);
    if (manifest.imageUrl === undefined) throw new Error(`Prepared VAC ${manifest.id} does not use a compact image asset`);
    await access(resolve(root, 'public', manifest.imageUrl));
    manifests.push(manifest);
  }
  await activateVacManifests(manifests);
  console.log(`Activated ${manifests.length} previously prepared and validated VAC chart(s).`);
} else {
  const results = [];
  for (const config of selected) {
    const sourcePdfPath = options.sourceDirectory === undefined
      ? options.sourcePdfPath
      : resolve(options.sourceDirectory, `${config.icao}-${basename(new URL(config.sourceUrl).pathname)}`);
    const result = await prepareVac(config, {
      ...(sourcePdfPath === undefined ? {} : { sourcePdfPath }),
      activate: false,
    });
    results.push(result);
    console.log(`Prepared ${result.manifest.title}`);
    console.log(`Validation RMS/max: ${result.report.validation.residualRmsMeters.toFixed(1)} / ${result.report.validation.maximumResidualMeters.toFixed(1)} m`);
    console.log(`Raster: ${result.report.assetCount} file(s), ${result.report.assetBytes} bytes (${result.assetPath})`);
  }
  if (options.activate) await activateVacManifests(results.map(({ manifest }) => manifest));
  console.log(options.activate
    ? `Activated ${results.length} reviewed VAC chart(s) in the approved local aeronautical dataset.`
    : `Prepared ${results.length} chart(s) without activation; pass --activate after review.`);
}
