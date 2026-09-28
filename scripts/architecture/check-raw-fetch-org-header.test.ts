import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  RAW_FETCH_ORG_HEADER_EXEMPTIONS,
  runRawFetchOrgHeaderCheck,
} from './check-raw-fetch-org-header';

describe('check-raw-fetch-org-header', () => {
  let testDir = '';

  beforeEach(() => {
    testDir = mkdtempSync(path.join(tmpdir(), 'raw-fetch-org-header-'));
  });

  afterEach(() => {
    rmSync(testDir, { force: true, recursive: true });
  });

  function writeFixture(relativePath: string, content: string): void {
    const filePath = path.join(testDir, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }

  function violationsOf() {
    return runRawFetchOrgHeaderCheck({ rootDir: testDir }).violations;
  }

  it('fails on a new raw fetch that sends only a bearer header', () => {
    writeFixture(
      'packages/hooks/data/use-report.ts',
      `
        export async function loadReport(token: string) {
          return fetch('/v1/reports', {
            headers: { Authorization: \`Bearer \${token}\` },
          });
        }
      `,
    );

    expect(violationsOf()).toEqual([
      expect.objectContaining({
        file: 'packages/hooks/data/use-report.ts',
        line: 4,
      }),
    ]);
  });

  it('fails on a quoted lowercase key in a tsx component', () => {
    writeFixture(
      'apps/app/app/(protected)/[orgSlug]/reports/content.tsx',
      `
        export default function Content({ token }: { token: string }) {
          void fetch('/v1/reports', { headers: { 'authorization': token } });
          return <div />;
        }
      `,
    );

    expect(violationsOf()).toHaveLength(1);
  });

  it('passes when the helper is spread into the same headers object', () => {
    writeFixture(
      'packages/hooks/data/use-report.ts',
      `
        import { getRequestOrganizationHeaders } from '@genfeedai/services/core/interceptor.service';

        export async function loadReport(token: string) {
          return fetch('/v1/reports', {
            headers: {
              ...getRequestOrganizationHeaders(),
              Authorization: \`Bearer \${token}\`,
            },
          });
        }
      `,
    );

    expect(violationsOf()).toEqual([]);
  });

  it('passes a conditional bearer spread inside a covered literal', () => {
    writeFixture(
      'packages/agent/src/api.ts',
      `
        export function headers(token?: string) {
          return {
            ...getRequestOrganizationHeaders(),
            ...(token ? { Authorization: \`Bearer \${token}\` } : {}),
          };
        }
      `,
    );

    expect(violationsOf()).toEqual([]);
  });

  it('fails a conditional bearer spread when no enclosing literal has the helper', () => {
    writeFixture(
      'packages/agent/src/api.ts',
      `
        export function headers(token?: string) {
          return { ...(token ? { Authorization: \`Bearer \${token}\` } : {}) };
        }
      `,
    );

    expect(violationsOf()).toHaveLength(1);
  });

  it('does not accept the helper in a sibling literal', () => {
    writeFixture(
      'packages/agent/src/api.ts',
      `
        export function send(token: string) {
          const organization = { ...getRequestOrganizationHeaders() };
          return fetch('/v1/x', { headers: { Authorization: token } });
        }
      `,
    );

    expect(violationsOf()).toHaveLength(1);
  });

  it('accepts this.requestOrganizationHeaders() in an HTTPBaseService subclass', () => {
    writeFixture(
      'packages/services/management/keys.service.ts',
      `
        export class KeysService extends HTTPBaseService {
          verify() {
            return fetch('/v1/keys/verify', {
              headers: {
                ...this.requestOrganizationHeaders(),
                Authorization: \`Bearer \${this.token}\`,
              },
            });
          }
        }
      `,
    );

    expect(violationsOf()).toEqual([]);
  });

  it('checks imperative header writes against their enclosing function', () => {
    writeFixture(
      'packages/agent/src/covered.ts',
      `
        export function build(token: string) {
          const headers: Record<string, string> = { ...getRequestOrganizationHeaders() };
          headers.Authorization = \`Bearer \${token}\`;
          return headers;
        }
      `,
    );
    writeFixture(
      'packages/agent/src/uncovered.ts',
      `
        export function build(token: string) {
          const headers = new Headers();
          headers.set('authorization', \`Bearer \${token}\`);
          const record: Record<string, string> = {};
          record['Authorization'] = token;
          return [headers, record];
        }
      `,
    );

    expect(violationsOf()).toEqual([
      expect.objectContaining({
        file: 'packages/agent/src/uncovered.ts',
        line: 4,
      }),
      expect.objectContaining({
        file: 'packages/agent/src/uncovered.ts',
        line: 6,
      }),
    ]);
  });

  it('fails shorthand, computed-literal and tuple header forms', () => {
    writeFixture(
      'packages/hooks/data/forms.ts',
      `
        export function send(token: string) {
          const Authorization = \`Bearer \${token}\`;
          void fetch('/v1/a', { headers: { Authorization } });
          void fetch('/v1/b', { headers: { ['Authorization']: token } });
          return fetch('/v1/c', { headers: new Headers([['Authorization', token]]) });
        }
      `,
    );

    expect(violationsOf().map(({ line }) => line)).toEqual([4, 5, 6]);
  });

  it('ignores lowercase domain fields named authorization', () => {
    writeFixture(
      'packages/actions/src/registry.ts',
      `
        export const action = { authorization: 'user' };
        action.authorization = 'public';
      `,
    );

    expect(violationsOf()).toEqual([]);
  });

  it('skips tests and every listed exemption', () => {
    const bearerFetch = `
      export function send(token: string) {
        return fetch('/v1/x', { headers: { Authorization: token } });
      }
    `;
    writeFixture('packages/hooks/data/use-report.test.ts', bearerFetch);
    writeFixture('apps/app/app/(public)/oauth/cli/content.tsx', bearerFetch);
    writeFixture('apps/app/proxy.ts', bearerFetch);
    writeFixture('packages/services/core/socket.service.ts', bearerFetch);
    writeFixture('apps/server/api/src/client.ts', bearerFetch);

    expect(violationsOf()).toEqual([]);
  });

  it('gives every exemption a reason', () => {
    for (const exemption of RAW_FETCH_ORG_HEADER_EXEMPTIONS) {
      expect(exemption.reason.length).toBeGreaterThan(20);
    }
  });
});
