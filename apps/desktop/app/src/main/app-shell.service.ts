import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  IDesktopEnvironment,
  IDesktopSession,
} from '@genfeedai/contracts/desktop';
import { DESKTOP_HTTP_HEADERS } from '@genfeedai/contracts/desktop';
import { app, type BrowserWindow } from 'electron';
import {
  resolveBundledAppUrl,
  resolveExternalDevAppUrl,
  resolveRemoteAppUrl,
} from './app-shell-origin.util';

const mainDir = path.dirname(fileURLToPath(import.meta.url));

type DesktopAppShellLogWriter = (
  level: 'error' | 'info',
  message: string,
) => void;

export function writeDesktopAppShellError(
  message: string,
  writeLog?: DesktopAppShellLogWriter,
  writeStderr: (message: string) => void = (value) =>
    process.stderr.write(value),
): void {
  writeStderr(message);
  writeLog?.('error', message);
}

function stripApiVersionSuffix(value: string): string {
  return value.replace(/\/v1\/?$/, '');
}

async function waitForServer(url: string, timeoutMs = 60_000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(2_000),
      });

      if (response.status < 500) {
        return;
      }
    } catch {
      // Server not ready yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for desktop app shell at ${url}`);
}

export class DesktopAppShellService {
  private appServerProcess: ChildProcess | null = null;
  private activeAppUrl: URL | null = null;
  private headersRegistered = false;
  private started = false;

  constructor(
    private readonly environment: IDesktopEnvironment,
    private readonly getSession: () => IDesktopSession | null,
    private readonly getDataDir: () => string,
    private readonly writeLog?: DesktopAppShellLogWriter,
  ) {}

  private writeError(message: string): void {
    writeDesktopAppShellError(message, this.writeLog);
  }

  get appOrigin(): string {
    if (!this.activeAppUrl) {
      throw new Error('Desktop app shell has not selected an active origin.');
    }

    return this.activeAppUrl.origin;
  }

  private isExternalDevServer(): boolean {
    return !app.isPackaged && Boolean(process.env.GENFEED_DESKTOP_APP_URL);
  }

  private get bundledAppUrl(): URL {
    return resolveBundledAppUrl(this.environment.appEndpoint);
  }

  private getBundledShellRoot(): string {
    return app.isPackaged
      ? path.join(
          process.resourcesPath,
          'app.asar.unpacked',
          'dist',
          'app-shell',
        )
      : path.join(mainDir, 'app-shell');
  }

  private getBundledServerPath(): string {
    const root = this.getBundledShellRoot();
    const directServerPath = path.join(root, 'server.js');

    if (fs.existsSync(directServerPath)) {
      return directServerPath;
    }

    const queue = [root];

    while (queue.length > 0) {
      const current = queue.shift();

      if (!current) {
        continue;
      }

      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const absolutePath = path.join(current, entry.name);

        if (entry.isDirectory()) {
          queue.push(absolutePath);
          continue;
        }

        if (entry.isFile() && entry.name === 'server.js') {
          return absolutePath;
        }
      }
    }

    return directServerPath;
  }

  private buildServerEnvironment(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      API_URL: stripApiVersionSuffix(this.environment.apiEndpoint),
      ELECTRON_RUN_AS_NODE: '1',
      GENFEED_DESKTOP_APP_PORT: String(this.environment.appPort),
      GENFEED_DESKTOP_DATA_DIR: this.getDataDir(),
      HOSTNAME: this.bundledAppUrl.hostname,
      NEXT_PUBLIC_API_ENDPOINT: `${this.bundledAppUrl.origin}/v1`,
      NEXT_PUBLIC_API_URL: '/v1',
      NEXT_PUBLIC_CDN_URL: this.environment.cdnUrl,
      NEXT_PUBLIC_DESKTOP_SHELL: '1',
      NEXT_PUBLIC_WS_ENDPOINT: this.environment.wsEndpoint,
      PORT: String(this.environment.appPort),
    };
  }

  private attachServerLogs(child: ChildProcess): void {
    child.stdout?.on('data', (chunk: Buffer | string) => {
      const message = `[desktop-app] ${chunk.toString()}`;
      process.stdout.write(message);
      this.writeLog?.('info', message);
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      const message = `[desktop-app] ${chunk.toString()}`;
      this.writeError(message);
    });
  }

  private startBundledServer(): void {
    if (this.appServerProcess || this.isExternalDevServer()) {
      return;
    }

    const serverPath = this.getBundledServerPath();

    if (!fs.existsSync(serverPath)) {
      throw new Error(`Bundled desktop app shell not found at ${serverPath}`);
    }

    this.appServerProcess = spawn(process.execPath, [serverPath], {
      cwd: path.dirname(serverPath),
      env: this.buildServerEnvironment(),
      stdio: 'pipe',
    });

    this.attachServerLogs(this.appServerProcess);

    this.appServerProcess.on('exit', (code, signal) => {
      this.appServerProcess = null;
      this.started = false;

      this.writeError(
        `[desktop-app] app shell exited (${code ?? 'null'} / ${signal ?? 'null'})\n`,
      );
    });
  }

  private getOriginPattern(): string {
    return `${this.appOrigin}/*`;
  }

  registerAuthHeaders(window: BrowserWindow): void {
    if (this.headersRegistered) {
      return;
    }

    this.headersRegistered = true;

    window.webContents.session.webRequest.onBeforeSendHeaders(
      {
        urls: [this.getOriginPattern()],
      },
      (details, callback) => {
        const nextHeaders = {
          ...details.requestHeaders,
        };
        const session = this.getSession();

        delete nextHeaders[DESKTOP_HTTP_HEADERS.token];
        delete nextHeaders[DESKTOP_HTTP_HEADERS.userEmail];
        delete nextHeaders[DESKTOP_HTTP_HEADERS.userId];
        delete nextHeaders[DESKTOP_HTTP_HEADERS.userName];
        nextHeaders[DESKTOP_HTTP_HEADERS.version] = app.getVersion();

        if (session) {
          nextHeaders[DESKTOP_HTTP_HEADERS.token] = session.token;
          nextHeaders[DESKTOP_HTTP_HEADERS.userId] = session.userId;

          if (session.userEmail) {
            nextHeaders[DESKTOP_HTTP_HEADERS.userEmail] = session.userEmail;
          }

          if (session.userName) {
            nextHeaders[DESKTOP_HTTP_HEADERS.userName] = session.userName;
          }
        }

        callback({ requestHeaders: nextHeaders });
      },
    );
  }

  async start(): Promise<string> {
    if (this.started) {
      return this.appOrigin;
    }

    if (this.isExternalDevServer()) {
      this.activeAppUrl = resolveExternalDevAppUrl(
        process.env.GENFEED_DESKTOP_APP_URL || this.environment.appEndpoint,
      );
      await waitForServer(this.appOrigin);
      this.started = true;
      return this.appOrigin;
    }

    if (app.isPackaged) {
      const remoteAppUrl = resolveRemoteAppUrl(this.environment.authEndpoint);

      try {
        await waitForServer(remoteAppUrl.origin, 5_000);
        this.activeAppUrl = remoteAppUrl;
        this.started = true;
        return this.appOrigin;
      } catch {
        this.writeError(
          `[desktop-app] remote shell unavailable at ${remoteAppUrl.origin}; starting bundled fallback.\n`,
        );
      }
    }

    this.activeAppUrl = this.bundledAppUrl;
    this.startBundledServer();
    await waitForServer(this.appOrigin);
    this.started = true;

    return this.appOrigin;
  }

  async stop(): Promise<void> {
    if (!this.appServerProcess) {
      return;
    }

    const activeProcess = this.appServerProcess;
    this.appServerProcess = null;
    this.started = false;

    await new Promise<void>((resolve) => {
      if (activeProcess.exitCode !== null) {
        resolve();
        return;
      }

      activeProcess.once('exit', () => resolve());
      activeProcess.kill();
    });
  }

  buildInitialUrl(_session: IDesktopSession | null): string {
    return new URL('/', this.appOrigin).toString();
  }
}
