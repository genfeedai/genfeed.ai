import { afterEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DesktopLogService, redactDesktopLogLine } from './log.service';

const cleanup: string[] = [];

afterEach(() => {
  for (const target of cleanup.splice(0)) {
    fs.rmSync(target, { force: true, recursive: true });
  }
});

describe('DesktopLogService', () => {
  it('persists startup diagnostics', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genfeed-log-'));
    cleanup.push(directory);
    const service = new DesktopLogService(path.join(directory, 'main.log'));

    service.info('cloud shell starting');
    service.error('local runtime failed');

    expect(fs.readFileSync(service.getPath(), 'utf8')).toContain(
      'INFO cloud shell starting',
    );
    expect(fs.readFileSync(service.getPath(), 'utf8')).toContain(
      'ERROR local runtime failed',
    );
  });

  it('redacts desktop credentials before writing', () => {
    expect(redactDesktopLogLine('Bearer secret.token')).toBe(
      'Bearer [REDACTED]',
    );
    expect(redactDesktopLogLine('token="gf_private_value"')).toBe(
      'token="[REDACTED]"',
    );
  });
});
