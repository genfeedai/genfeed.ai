import { randomUUID } from 'node:crypto';
import type {
  IDesktopEnvironment,
  IDesktopSession,
} from '@genfeedai/desktop-contracts';

interface ParsedSentryDsn {
  endpoint: string;
  publicKey: string;
}

export class DesktopTelemetryService {
  private initialized = false;
  private parsedDsn: ParsedSentryDsn | null = null;
  private session: IDesktopSession | null = null;

  constructor(private readonly environment: IDesktopEnvironment) {}

  init(): void {
    if (this.initialized || !this.environment.sentryDsn) {
      return;
    }

    this.parsedDsn = this.parseDsn(this.environment.sentryDsn);
    this.initialized = this.parsedDsn !== null;
  }

  setUser(session: IDesktopSession | null): void {
    this.session = session;
  }

  captureException(error: unknown, context?: Record<string, unknown>): void {
    if (!this.initialized || !this.parsedDsn) {
      return;
    }

    const actualError =
      error instanceof Error
        ? error
        : new Error(String(error ?? 'Unknown error'));

    const payload = {
      environment: this.environment.sentryEnvironment,
      event_id: randomUUID().replaceAll('-', ''),
      exception: {
        values: [
          {
            stacktrace: actualError.stack
              ? {
                  frames: actualError.stack.split('\n').map((line) => ({
                    filename: line.trim(),
                  })),
                }
              : undefined,
            type: actualError.name,
            value: actualError.message,
          },
        ],
      },
      extra: context,
      level: 'error',
      platform: 'node',
      release: this.environment.sentryRelease,
      tags: {
        app: 'desktop',
        runtime: 'main',
      },
      timestamp: Math.floor(Date.now() / 1000),
      user: this.session
        ? {
            email: this.session.userEmail,
            id: this.session.userId,
            username: this.session.userName,
          }
        : undefined,
    };

    void fetch(
      `${this.parsedDsn.endpoint}?sentry_version=7&sentry_key=${this.parsedDsn.publicKey}&sentry_client=genfeed-desktop%2F0.1.0`,
      {
        body: JSON.stringify(payload),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      },
    ).catch(() => undefined);
  }

  private parseDsn(dsn: string): ParsedSentryDsn | null {
    try {
      const url = new URL(dsn);
      const projectId = url.pathname.replace(/^\//, '');
      if (!projectId || !url.username) {
        return null;
      }

      return {
        endpoint: `${url.protocol}//${url.host}/api/${projectId}/store/`,
        publicKey: url.username,
      };
    } catch {
      return null;
    }
  }
}
