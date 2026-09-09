import { ENDU_VAC_PREPARATION } from './prepared/endu';
import { prepareVac } from './prepareVac';

interface CliOptions { readonly icao: string; readonly sourcePdfPath?: string; readonly activate: boolean }

function parseArgs(args: readonly string[]): CliOptions {
  let icao: string | undefined;
  let sourcePdfPath: string | undefined;
  let activate = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') continue;
    if (arg === '--icao') icao = args[++index];
    else if (arg === '--source-pdf') sourcePdfPath = args[++index];
    else if (arg === '--activate') activate = true;
    else throw new Error(`Unknown VAC preparation option: ${String(arg)}`);
  }
  if (icao === undefined) throw new Error('Usage: pnpm aero:prepare:vac -- --icao ENDU [--source-pdf path] [--activate]');
  return { icao: icao.toUpperCase(), ...(sourcePdfPath === undefined ? {} : { sourcePdfPath }), activate };
}

const options = parseArgs(process.argv.slice(2));
const configs = new Map([['ENDU', ENDU_VAC_PREPARATION]]);
const config = configs.get(options.icao);
if (config === undefined) throw new Error(`No reviewed VAC preparation config exists for ${options.icao}`);
const result = await prepareVac(config, options);
console.log(`Prepared ${result.manifest.title}`);
console.log(`Validation RMS: ${result.report.validation.residualRmsMeters.toFixed(1)} m`);
console.log(`Validation maximum: ${result.report.validation.maximumResidualMeters.toFixed(1)} m`);
console.log(`Tiles: ${result.report.tileCount} (${result.tileDirectory})`);
console.log(`Manifest: ${result.manifestPath}`);
console.log(`Report: ${result.reportPath}`);
console.log(result.activated ? 'Activated in the approved local aeronautical dataset.' : 'Not activated; pass --activate after review.');
