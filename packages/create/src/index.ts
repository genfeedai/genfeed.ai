#!/usr/bin/env node

import { execFile, spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  access,
  appendFile,
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Command } from 'commander';
import { consola } from 'consola';
import { downloadTemplate } from 'giget';
import { MongoBinary } from 'mongodb-memory-server';

interface InstallCommand {
  command: string;
  args: string[];
  label: string;
}

const TEMPLATE_REPOSITORY = 'github:genfeedai/genfeed.ai#develop';
const MANAGED_MONGO_URI = 'mongodb://127.0.0.1:27017/genfeed';
const ONBOARDING_URL = 'http://localhost:3102/onboarding';
const GENFEED_DATA_DIR = join(homedir(), '.genfeed', 'data');

export function commandExists(command: string): boolean {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore' });
  return result.status === 0;
}

export function getInstallCommand(
  hasCommand: (command: string) => boolean = commandExists,
): InstallCommand {
  if (hasCommand('bun')) {
    return { args: ['install'], command: 'bun', label: 'bun install' };
  }
  return { args: ['install'], command: 'npm', label: 'npm install' };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function generateEncryptionKey(): string {
  return randomBytes(32).toString('base64url').slice(0, 32);
}

const DEFAULT_ENV = `# ─── Required ───────────────────────────────────────────────────────
MONGODB_URI=mongodb://127.0.0.1:27017/genfeed
REDIS_URL=redis://localhost:6379
PORT=4001
TOKEN_ENCRYPTION_KEY=${generateEncryptionKey()}

# ─── Internal Services ──────────────────────────────────────────────
GENFEEDAI_API_URL=http://localhost:4001
GENFEEDAI_APP_URL=http://localhost:3102
GENFEEDAI_CDN_URL=http://localhost:3005
GENFEEDAI_PUBLIC_URL=http://localhost:3102
GENFEEDAI_WEBHOOKS_URL=http://localhost:4001
GENFEEDAI_MICROSERVICES_FILES_URL=http://localhost:3005
GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL=http://localhost:3007

# ─── Frontend ──────────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=/v1
NEXT_PUBLIC_API_ENDPOINT=http://localhost:4001/v1
NEXT_PUBLIC_WS_ENDPOINT=http://localhost:3007
NEXT_PUBLIC_CDN_URL=http://localhost:3005

# ─── AI Providers (add your keys during onboarding) ────────────────
# REPLICATE_API_TOKEN=
# FAL_API_KEY=
# ELEVENLABS_API_KEY=
# HF_API_TOKEN=

# ─── Ollama (local LLM — optional) ────────────────────────────────
# OLLAMA_ENABLED=false
# OLLAMA_BASE_URL=http://localhost:11434
# OLLAMA_DEFAULT_MODEL=llama3.1
`;

const ENV_LOCATIONS = ['.env', 'apps/server/api/.env'];

export async function writeDefaultEnv(projectDirectory: string): Promise<void> {
  for (const location of ENV_LOCATIONS) {
    const envPath = join(projectDirectory, location);
    const hasEnv = await fileExists(envPath);

    if (!hasEnv) {
      await mkdir(dirname(envPath), { recursive: true });
      await writeFile(envPath, DEFAULT_ENV, 'utf-8');
    }
  }

  consola.success('Created .env with working defaults');
}

export function openBrowser(url: string): void {
  const platform = process.platform;

  if (platform === 'darwin') {
    execFile('open', [url]);
  } else if (platform === 'linux') {
    execFile('xdg-open', [url]);
  } else if (platform === 'win32') {
    execFile('cmd', ['/c', 'start', '', url]);
  }
}

async function waitForServer(
  url: string,
  timeoutMs = 180_000,
): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });

      if (response.ok || response.status === 404) {
        return true;
      }
    } catch {
      // Server not ready yet
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  return false;
}

async function runInstall(projectDirectory: string): Promise<InstallCommand> {
  const installCommand = getInstallCommand();

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(installCommand.command, installCommand.args, {
      cwd: projectDirectory,
      env: { ...process.env, HUSKY: '0' },
      stdio: 'inherit',
    });

    child.on('error', (error) => rejectPromise(error));
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(
        new Error(
          `${installCommand.label} failed with exit code ${code ?? 'unknown'}`,
        ),
      );
    });
  });

  return installCommand;
}

async function replaceEnvValue(
  projectDirectory: string,
  key: string,
  value: string,
): Promise<void> {
  const pattern = new RegExp(`^${key}=.*$`, 'm');

  for (const location of ENV_LOCATIONS) {
    const envPath = join(projectDirectory, location);
    const exists = await fileExists(envPath);

    if (!exists) continue;

    const content = await readFile(envPath, 'utf-8');

    if (pattern.test(content)) {
      await writeFile(
        envPath,
        content.replace(pattern, `${key}=${value}`),
        'utf-8',
      );
    } else {
      await appendFile(envPath, `\n${key}=${value}`, 'utf-8');
    }
  }
}

/**
 * Start a persistent mongod process using the binary from mongodb-memory-server.
 * Data is stored at ~/.genfeed/data/db and survives restarts.
 */
async function startManagedMongo(): Promise<void> {
  const dbPath = join(GENFEED_DATA_DIR, 'db');
  await mkdir(dbPath, { recursive: true });

  consola.start('Downloading MongoDB binary (cached after first run)…');
  const mongodPath = await MongoBinary.getPath({});
  consola.success('MongoDB binary ready');

  const mongod = spawn(
    mongodPath,
    ['--dbpath', dbPath, '--port', '27017', '--wiredTigerCacheSizeGB', '0.5'],
    {
      detached: true,
      stdio: 'ignore',
    },
  );

  mongod.unref();

  // Wait for mongod to be ready
  await new Promise((r) => setTimeout(r, 2000));
  consola.success('MongoDB started (persistent data at ~/.genfeed/data/db)');
}

/**
 * Start a persistent redis-server process.
 * Data is stored at ~/.genfeed/data/redis with AOF persistence.
 */
async function startManagedRedis(): Promise<void> {
  const redisDir = join(GENFEED_DATA_DIR, 'redis');
  await mkdir(redisDir, { recursive: true });

  if (!commandExists('redis-server')) {
    consola.warn(
      'redis-server not found. Install Redis or provide REDIS_URL in .env',
    );
    consola.info('  macOS: brew install redis');
    consola.info('  Linux: sudo apt install redis-server');
    return;
  }

  const redis = spawn(
    'redis-server',
    [
      '--dir',
      redisDir,
      '--appendonly',
      'yes',
      '--port',
      '6379',
      '--daemonize',
      'yes',
    ],
    { stdio: 'ignore' },
  );

  redis.unref();
  await new Promise((r) => setTimeout(r, 1000));
  consola.success('Redis started (persistent data at ~/.genfeed/data/redis)');
}

export async function setupMongoDB(projectDirectory: string): Promise<void> {
  const hasOwnMongo = await consola.prompt(
    'Do you have an existing MongoDB instance? (press Enter to use managed MongoDB)',
    { initial: false, type: 'confirm' },
  );

  if (hasOwnMongo) {
    const uri = await consola.prompt('Enter your MongoDB URI:', {
      initial: MANAGED_MONGO_URI,
      type: 'text',
    });

    await replaceEnvValue(projectDirectory, 'MONGODB_URI', String(uri));
    consola.success('MongoDB URI saved to .env');
    return;
  }

  await startManagedMongo();
  await replaceEnvValue(projectDirectory, 'MONGODB_URI', MANAGED_MONGO_URI);
  await replaceEnvValue(projectDirectory, 'GENFEED_MANAGED_MONGO', 'true');
}

export async function setupRedis(projectDirectory: string): Promise<void> {
  const hasOwnRedis = await consola.prompt(
    'Do you have an existing Redis instance? (press Enter to use managed Redis)',
    { initial: false, type: 'confirm' },
  );

  if (hasOwnRedis) {
    const url = await consola.prompt('Enter your Redis URL:', {
      initial: 'redis://localhost:6379',
      type: 'text',
    });

    await replaceEnvValue(projectDirectory, 'REDIS_URL', String(url));
    consola.success('Redis URL saved to .env');
    return;
  }

  await startManagedRedis();
}

async function scaffoldProject(projectName: string): Promise<void> {
  const projectDirectory = resolve(process.cwd(), projectName);

  consola.start(`Scaffolding ${projectName} from ${TEMPLATE_REPOSITORY}`);

  await downloadTemplate(TEMPLATE_REPOSITORY, {
    dir: projectDirectory,
    force: false,
  });

  consola.success(`Downloaded template into ${projectDirectory}`);

  await writeDefaultEnv(projectDirectory);

  const installCommand = await runInstall(projectDirectory);
  consola.success(`Dependencies installed with ${installCommand.label}`);

  await setupMongoDB(projectDirectory);
  await setupRedis(projectDirectory);

  // Start all services
  const devCommand = installCommand.command === 'bun' ? 'bun' : 'npm';
  const child = spawn(devCommand, ['run', 'dev'], {
    cwd: projectDirectory,
    stdio: 'inherit',
  });

  consola.start('Waiting for services to start…');

  const [apiReady, webReady] = await Promise.all([
    waitForServer('http://localhost:4001/v1/health'),
    waitForServer('http://localhost:3102'),
  ]);

  if (apiReady && webReady) {
    consola.box(
      [
        'Genfeed.ai is running!',
        '',
        `App:  http://localhost:3102`,
        `API:  http://localhost:4001`,
        '',
        `Opening ${ONBOARDING_URL}`,
      ].join('\n'),
    );

    openBrowser(ONBOARDING_URL);
  } else {
    consola.warn('Services did not start in time. Open manually:');
    consola.info(ONBOARDING_URL);
  }

  await new Promise<void>((resolvePromise) => {
    child.on('close', (code) => {
      process.exitCode = code ?? 0;
      resolvePromise();
    });
  });
}

async function main(): Promise<void> {
  const program = new Command()
    .name('genfeedai')
    .description('Genfeed.ai — AI OS for content creation. Self-host for free.')
    .version('0.2.0')
    .argument('<project-name>', 'Directory name for the new project')
    .action(async (projectName: string) => {
      await scaffoldProject(projectName);
    })
    .showHelpAfterError();

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    const normalizedError =
      error instanceof Error ? error : new Error('Unknown CLI error');
    consola.error(normalizedError.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
