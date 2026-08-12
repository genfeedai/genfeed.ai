import fs from 'node:fs';
import path from 'node:path';

const MAX_LOG_BYTES = 2 * 1024 * 1024;
export function redactDesktopLogLine(value: string): string {
  return value
    .replace(/\bgf_[A-Za-z0-9._-]+\b/g, '[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(
      /("?(?:apiKey|cookieValue|token)"?\s*[:=]\s*")([^"\s]+)(")/gi,
      '$1[REDACTED]$3',
    );
}

export class DesktopLogService {
  constructor(private readonly logPath: string) {}

  getPath(): string {
    return this.logPath;
  }

  private rotateIfNeeded(): void {
    try {
      if (fs.statSync(this.logPath).size < MAX_LOG_BYTES) return;
      const rotatedPath = `${this.logPath}.1`;
      fs.rmSync(rotatedPath, { force: true });
      fs.renameSync(this.logPath, rotatedPath);
    } catch {
      // The first write has no existing log to rotate.
    }
  }

  write(level: 'error' | 'info', message: string): void {
    try {
      this.rotateIfNeeded();
      fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
      const line = `${new Date().toISOString()} ${level.toUpperCase()} ${redactDesktopLogLine(message).trim()}\n`;
      fs.appendFileSync(this.logPath, line, { encoding: 'utf8', mode: 0o600 });
      fs.chmodSync(this.logPath, 0o600);
    } catch {
      // Diagnostics must never become an application startup dependency.
    }
  }

  error(message: string): void {
    this.write('error', message);
  }

  info(message: string): void {
    this.write('info', message);
  }
}
