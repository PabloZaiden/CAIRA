import { execFile, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface TemporarySshKeyPair {
  readonly privateKeyPath: string;
  readonly publicKey: string;
  cleanup(): Promise<void>;
}

interface SshTarget {
  readonly host: string;
  readonly username: string;
  readonly privateKeyPath: string;
}

function sshBaseArgs(target: SshTarget): string[] {
  return [
    '-i',
    target.privateKeyPath,
    '-o',
    'BatchMode=yes',
    '-o',
    'IdentitiesOnly=yes',
    '-o',
    'StrictHostKeyChecking=no',
    '-o',
    'UserKnownHostsFile=/dev/null',
    '-o',
    'ConnectTimeout=15',
    `${target.username}@${target.host}`
  ];
}

function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export async function createTemporarySshKeyPair(prefix = 'caira-jumpbox'): Promise<TemporarySshKeyPair> {
  const directory = await mkdtemp(join(tmpdir(), `${prefix}-`));
  const privateKeyPath = join(directory, 'id_ed25519');

  await execFileAsync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-f', privateKeyPath, '-C', 'caira-test-jumpbox'], {
    timeout: 15_000,
    maxBuffer: 1024 * 1024
  });

  const publicKey = (await readFile(`${privateKeyPath}.pub`, 'utf-8')).trim();

  return {
    privateKeyPath,
    publicKey,
    cleanup: async () => {
      await rm(directory, { recursive: true, force: true });
    }
  };
}

export async function waitForJumpboxSsh(target: SshTarget, timeoutMs = 300_000): Promise<void> {
  const start = Date.now();
  let lastError = 'SSH connection was not ready';

  while (Date.now() - start < timeoutMs) {
    try {
      await execFileAsync('ssh', [...sshBaseArgs(target), 'true'], {
        timeout: 20_000,
        maxBuffer: 1024 * 1024
      });
      await execFileAsync('ssh', [...sshBaseArgs(target), 'cloud-init status --wait'], {
        timeout: 600_000,
        maxBuffer: 1024 * 1024
      });
      return;
    } catch (error) {
      const details = error as { stderr?: string; message?: string };
      lastError = details.stderr?.trim() || details.message || lastError;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10_000));
    }
  }

  throw new Error(`Jumpbox did not become reachable over SSH: ${lastError}`);
}

export async function copyDirectoryToJumpbox(
  target: SshTarget,
  localDir: string,
  remoteDir: string,
  excludePaths: readonly string[] = ['node_modules']
): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const tarArgs = ['-czf', '-', '-C', localDir];
    for (const excludePath of [...excludePaths, '.DS_Store', '._*']) {
      tarArgs.push(`--exclude=${excludePath}`);
    }
    tarArgs.push('.');

    const tarProcess = spawn('tar', tarArgs, {
      env: {
        ...process.env,
        COPYFILE_DISABLE: '1'
      },
      stdio: ['ignore', 'pipe', 'inherit']
    });
    const sshProcess = spawn(
      'ssh',
      [
        ...sshBaseArgs(target),
        `rm -rf ${shQuote(remoteDir)} && mkdir -p ${shQuote(remoteDir)} && tar -xzf - -C ${shQuote(remoteDir)}`
      ],
      {
        stdio: ['pipe', 'inherit', 'inherit']
      }
    );

    let tarExitCode: number | null = null;
    let sshExitCode: number | null = null;
    let settled = false;

    function settle(action: () => void): void {
      if (settled) return;
      settled = true;
      action();
    }

    tarProcess.on('error', (error) => settle(() => rejectPromise(error)));
    sshProcess.on('error', (error) => settle(() => rejectPromise(error)));

    tarProcess.stdout.on('error', (error) => settle(() => rejectPromise(error)));
    sshProcess.stdin.on('error', (error) => settle(() => rejectPromise(error)));
    tarProcess.stdout.pipe(sshProcess.stdin);

    function maybeResolve(): void {
      if (settled) return;
      if (tarExitCode === null || sshExitCode === null) return;
      if (tarExitCode !== 0) {
        settle(() => rejectPromise(new Error(`tar exited with code ${String(tarExitCode)}`)));
        return;
      }
      if (sshExitCode !== 0) {
        settle(() => rejectPromise(new Error(`ssh exited with code ${String(sshExitCode)}`)));
        return;
      }
      settle(resolvePromise);
    }

    tarProcess.on('close', (code) => {
      tarExitCode = code ?? 1;
      maybeResolve();
    });
    sshProcess.on('close', (code) => {
      sshExitCode = code ?? 1;
      maybeResolve();
    });
  });
}

export async function runJumpboxCommand(target: SshTarget, command: string): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn('ssh', [...sshBaseArgs(target), command], {
      stdio: 'inherit'
    });

    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`ssh command failed with exit code ${String(code ?? 1)}`));
    });
  });
}

export async function runJumpboxBashScript(target: SshTarget, script: string): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn('ssh', [...sshBaseArgs(target), 'bash -s'], {
      stdio: ['pipe', 'inherit', 'inherit']
    });

    let settled = false;
    function settle(action: () => void): void {
      if (settled) return;
      settled = true;
      action();
    }

    child.on('error', (error) => settle(() => rejectPromise(error)));
    child.stdin.on('error', (error) => settle(() => rejectPromise(error)));
    child.on('close', (code) => {
      if (code === 0) {
        settle(resolvePromise);
        return;
      }
      settle(() => rejectPromise(new Error(`ssh bash script failed with exit code ${String(code ?? 1)}`)));
    });

    child.stdin.end(`${script}\n`);
  });
}
