import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type {
  IDesktopEnvironment,
  IDesktopSession,
} from '@genfeedai/desktop-contracts';
import { app, type BrowserWindow } from 'electron';

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
  private readonly appUrl: URL;
  private headersRegistered = false;
  private started = false;

  constructor(
    private readonly environment: IDesktopEnvironment,
    private readonly getSession: () => IDesktopSession | null,
    private readonly sessionDbPath: string,
  ) {
    this.appUrl = new URL(
      this.isExternalDevServer()
        ? process.env.GENFEED_DESKTOP_APP_URL || environment.appEndpoint
        : environment.appEndpoint,
    );
  }

  private isExternalDevServer(): boolean {
    return !app.isPackaged && Boolean(process.env.GENFEED_DESKTOP_APP_URL);
  }

  private getBundledShellRoot(): string {
    return app.isPackaged
      ? path.join(
          process.resourcesPath,
          'app.asar.unpacked',
          'dist',
          'app-shell',
        )
      : path.join(__dirname, 'app-shell');
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
      GENFEED_DESKTOP_SESSION_DB_PATH: this.sessionDbPath,
      HOSTNAME: this.appUrl.hostname,
      NEXT_PUBLIC_API_ENDPOINT: this.environment.apiEndpoint,
      NEXT_PUBLIC_DESKTOP_SHELL: '1',
      PORT: String(this.environment.appPort),
    };
  }

  private attachServerLogs(child: ChildProcess): void {
    child.stdout?.on('data', (chunk: Buffer | string) => {
      process.stdout.write(`[desktop-app] ${chunk.toString()}`);
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      process.stderr.write(`[desktop-app] ${chunk.toString()}`);
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

      process.stderr.write(
        `[desktop-app] app shell exited (${code ?? 'null'} / ${signal ?? 'null'})\n`,
      );
    });
  }

  private getOriginPattern(): string {
    return `${this.appUrl.origin}/*`;
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

        delete nextHeaders['x-genfeed-desktop-token'];
        delete nextHeaders['x-genfeed-desktop-user-email'];
        delete nextHeaders['x-genfeed-desktop-user-id'];
        delete nextHeaders['x-genfeed-desktop-user-name'];

        if (session) {
          nextHeaders['x-genfeed-desktop-token'] = session.token;
          nextHeaders['x-genfeed-desktop-user-id'] = session.userId;

          if (session.userEmail) {
            nextHeaders['x-genfeed-desktop-user-email'] = session.userEmail;
          }

          if (session.userName) {
            nextHeaders['x-genfeed-desktop-user-name'] = session.userName;
          }
        }

        callback({ requestHeaders: nextHeaders });
      },
    );
  }

  async start(): Promise<string> {
    if (this.started) {
      return this.appUrl.origin;
    }

    if (!this.isExternalDevServer()) {
      this.startBundledServer();
    }

    await waitForServer(this.appUrl.origin);
    this.started = true;

    return this.appUrl.origin;
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
    return new URL('/', this.appUrl.origin).toString();
  }
}
