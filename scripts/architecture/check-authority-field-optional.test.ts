import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runAuthorityFieldOptionalCheck } from './check-authority-field-optional';

const rootDirs: string[] = [];

afterEach(() => {
  for (const rootDir of rootDirs.splice(0)) {
    rmSync(rootDir, { force: true, recursive: true });
  }
});

function fixture(files: Record<string, string>): string {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'authority-optional-'));
  rootDirs.push(rootDir);

  for (const [file, content] of Object.entries(files)) {
    const absolutePath = path.join(rootDir, file);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
  }

  return rootDir;
}

const KEY_DTO = 'apps/server/api/src/keys/dto/create-key.dto.ts';

describe('authority-field @IsOptional() ratchet', () => {
  it('flags @IsOptional() on scopes, expiresAt, allowedIps, role and organizationId', () => {
    const rootDir = fixture({
      [KEY_DTO]: `
        export class CreateKeyDto {
          @IsOptional()
          @IsArray()
          readonly scopes?: string[];

          @IsOptional() @IsDateString() readonly expiresAt?: string;
          @IsOptional() readonly allowedIps?: string[];
          @IsOptional() readonly role?: string;
          @IsOptional() readonly organizationId?: string;
        }
      `,
    });

    expect(
      runAuthorityFieldOptionalCheck({ baseline: [], rootDir }).violations.map(
        (violation) =>
          violation.kind === 'new-optional-field'
            ? violation.occurrence.property
            : 'stale',
      ),
    ).toEqual(['allowedIps', 'expiresAt', 'organizationId', 'role', 'scopes']);
  });

  it('accepts @IsOmittable() and unrelated optional fields', () => {
    const rootDir = fixture({
      [KEY_DTO]: `
        export class CreateKeyDto {
          @IsOmittable() @IsArray() readonly scopes?: string[];
          @IsOptional() @IsString() readonly description?: string;
          readonly role!: string;
        }
      `,
    });

    expect(
      runAuthorityFieldOptionalCheck({ baseline: [], rootDir }).violations,
    ).toEqual([]);
  });

  it('accepts a baselined field and flags it stale once the field is fixed', () => {
    const baseline = [{ file: KEY_DTO, property: 'scopes' }];
    const stillOptional = fixture({
      [KEY_DTO]: 'class A { @IsOptional() readonly scopes?: string[]; }',
    });
    const fixed = fixture({
      [KEY_DTO]: 'class A { @IsOmittable() readonly scopes?: string[]; }',
    });

    expect(
      runAuthorityFieldOptionalCheck({ baseline, rootDir: stillOptional })
        .violations,
    ).toEqual([]);
    expect(
      runAuthorityFieldOptionalCheck({
        baseline,
        rootDir: fixed,
      }).violations.map((violation) => violation.kind),
    ).toEqual(['stale-baseline-entry']);
  });

  it('flags a second declaration of a baselined property in the same file', () => {
    const rootDir = fixture({
      [KEY_DTO]: `
        class A { @IsOptional() readonly scopes?: string[]; }
        class B { @IsOptional() readonly scopes?: string[]; }
      `,
    });

    expect(
      runAuthorityFieldOptionalCheck({
        baseline: [{ file: KEY_DTO, property: 'scopes' }],
        rootDir,
      }).violations.map((violation) => violation.kind),
    ).toEqual(['new-optional-field']);
  });

  it('accepts two baselined declarations of the same property in one file', () => {
    const rootDir = fixture({
      [KEY_DTO]: `
        class A { @IsOptional() readonly scopes?: string[]; }
        class B { @IsOptional() readonly scopes?: string[]; }
      `,
    });

    expect(
      runAuthorityFieldOptionalCheck({
        baseline: [
          { file: KEY_DTO, property: 'scopes' },
          { file: KEY_DTO, property: 'scopes' },
        ],
        rootDir,
      }).violations,
    ).toEqual([]);
  });

  it('ignores specs and files outside server DTOs', () => {
    const rootDir = fixture({
      'apps/server/api/src/keys/dto/create-key.dto.spec.ts':
        'class A { @IsOptional() readonly scopes?: string[]; }',
      'apps/web/src/form.dto.ts':
        'class A { @IsOptional() readonly scopes?: string[]; }',
    });

    expect(
      runAuthorityFieldOptionalCheck({ baseline: [], rootDir }).violations,
    ).toEqual([]);
  });
});
