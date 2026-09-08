import {
  checkForAiracUpdate,
  prepareAiracUpdate,
  writeGithubOutputs,
  type AiracUpdateResult,
} from './airacUpdate';

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode !== '--check' && mode !== '--update' && mode !== '--validate') {
    throw new Error('Usage: airacUpdateCli.ts --check|--validate|--update');
  }
  const result: AiracUpdateResult = mode === '--check'
    ? await checkForAiracUpdate()
    : await prepareAiracUpdate(fetch, mode === '--update');

  console.log(`Approved edition: ${result.approvedEdition}`);
  console.log(`Newest published edition: ${result.discovered.edition.editionLabel}`);
  if (!result.updateAvailable) {
    console.log('No AIRAC update available.');
  } else if (mode === '--check') {
    console.log('AIRAC update available; approved data was not changed.');
  } else if (mode === '--validate') {
    console.log('Candidate imported and validated in memory; repository files were not changed.');
  } else {
    console.log(`Candidate dataset: ${result.datasetPath}`);
    console.log(`Import report: ${result.importReportPath}`);
    console.log(`Change report: ${result.changeReportPath}`);
    console.log('Candidate prepared for review. It becomes approved only after merge.');
  }
  await writeGithubOutputs(result);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
