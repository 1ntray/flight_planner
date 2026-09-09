import { spawn } from 'node:child_process';

export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
}

export async function runCommand(
  command: string,
  args: readonly string[],
  options: { readonly stdin?: string; readonly cwd?: string } = {},
): Promise<CommandResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.once('error', (error) => reject(new Error(
      `Required external tool "${command}" could not be started. Install Poppler and GDAL and ensure they are on PATH. ${error.message}`,
    )));
    child.once('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} ${args.join(' ')} failed with exit code ${String(code)}\n${stderr || stdout}`));
    });
    child.stdin.end(options.stdin ?? '');
  });
}

export async function requireVacTools(): Promise<Readonly<Record<string, string>>> {
  const probes: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['pdftoppm', ['-v']],
    ['gdal_translate', ['--version']],
    ['gdalwarp', ['--version']],
    ['gdaltransform', ['--version']],
    ['gdalinfo', ['--version']],
    ['gdal', ['--version']],
  ];
  const versions: Record<string, string> = {};
  for (const [command, args] of probes) {
    const result = await runCommand(command, args);
    versions[command] = `${result.stdout}\n${result.stderr}`.trim().split(/\r?\n/)[0] ?? 'unknown';
  }
  return versions;
}
