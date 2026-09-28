import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkOpaqueUserIds,
  collectOpaqueUserIdViolations,
} from './check-opaque-user-ids';

const testDirs: string[] = [];

afterEach(() => {
  for (const testDir of testDirs.splice(0)) {
    rmSync(testDir, { force: true, recursive: true });
  }
});

function fixture(files: Record<string, string>): string {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'opaque-user-ids-'));
  testDirs.push(rootDir);

  for (const [file, source] of Object.entries(files)) {
    const absolutePath = path.join(rootDir, file);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, source);
  }

  return rootDir;
}

const DTO_FILE = 'apps/server/api/src/collections/example/dto/example.dto.ts';

describe('opaque user ID guard', () => {
  it('accepts entity-id checks on Genfeed-owned IDs', () => {
    const source = [
      'export class ExampleDto {',
      '  @IsEntityId()',
      '  readonly brandId!: string;',
      '',
      '  @IsString()',
      '  @IsNotEmpty()',
      '  readonly userId!: string;',
      '}',
      'if (!isEntityId(organizationId) || !isEntityId(dto.brandId)) {}',
      'if (!isEntityId(user.organizationId)) {}',
    ].join('\n');

    expect(collectOpaqueUserIdViolations(DTO_FILE, source)).toEqual([]);
  });

  it('rejects isEntityId on a user ID', () => {
    const source = [
      'if (!isEntityId(userId)) {}',
      'if (!isEntityId(args.ownerUserId)) {}',
      'if (!isEntityId(session.user.id)) {}',
      'if (!validation.isEntityId(targetUser.id)) {}',
    ].join('\n');

    expect(collectOpaqueUserIdViolations(DTO_FILE, source)).toEqual([
      { file: DTO_FILE, kind: 'entity-id-call', line: 1, name: 'userId' },
      { file: DTO_FILE, kind: 'entity-id-call', line: 2, name: 'ownerUserId' },
      { file: DTO_FILE, kind: 'entity-id-call', line: 3, name: 'user.id' },
      {
        file: DTO_FILE,
        kind: 'entity-id-call',
        line: 4,
        name: 'targetUser.id',
      },
    ]);
  });

  it('rejects entity-id helpers applied to a user ID', () => {
    const source = [
      "EntityIdUtil.validate(user.userId ?? user.id, 'userId');",
      'EntityIdUtil.validateMany(dto.memberUserIds);',
      "InputValidationUtil.validateEntityId(value, 'ownerUserId');",
      'if (EntityIdUtil.isValid(targetUser.id)) {}',
    ].join('\n');

    expect(collectOpaqueUserIdViolations(DTO_FILE, source)).toEqual([
      { file: DTO_FILE, kind: 'entity-id-call', line: 1, name: 'userId' },
      {
        file: DTO_FILE,
        kind: 'entity-id-call',
        line: 2,
        name: 'memberUserIds',
      },
      {
        file: DTO_FILE,
        kind: 'entity-id-call',
        line: 3,
        name: 'ownerUserId',
      },
      {
        file: DTO_FILE,
        kind: 'entity-id-call',
        line: 4,
        name: 'targetUser.id',
      },
    ]);
  });

  it('accepts entity-id helpers on Genfeed-owned IDs', () => {
    const source = [
      "EntityIdUtil.validate(id, 'personaId');",
      "EntityIdUtil.validate(user.organizationId, 'organizationId');",
      "EntityIdUtil.validateMany(body.ingredientIds, 'ingredientIds');",
      "InputValidationUtil.validateString(memberId, 'memberIds[0]');",
    ].join('\n');

    expect(collectOpaqueUserIdViolations(DTO_FILE, source)).toEqual([]);
  });

  it('rejects @IsEntityId() on user ID properties', () => {
    const source = [
      'export class ExampleDto {',
      '  @IsEntityId()',
      '  readonly userId!: string;',
      '',
      '  @IsEntityId()',
      '  user!: string;',
      '',
      '  @IsArray()',
      '  @IsEntityId({ each: true })',
      '  reportRecipientUserIds?: string[];',
      '}',
    ].join('\n');

    expect(collectOpaqueUserIdViolations(DTO_FILE, source)).toEqual([
      {
        file: DTO_FILE,
        kind: 'entity-id-decorator',
        line: 3,
        name: 'userId',
      },
      { file: DTO_FILE, kind: 'entity-id-decorator', line: 6, name: 'user' },
      {
        file: DTO_FILE,
        kind: 'entity-id-decorator',
        line: 10,
        name: 'reportRecipientUserIds',
      },
    ]);
  });

  it('scans production sources and skips specs', () => {
    const rootDir = fixture({
      [DTO_FILE]: 'export class A {\n  @IsEntityId()\n  userId!: string;\n}',
      'apps/server/api/src/collections/example/example.spec.ts':
        'expect(isEntityId(userId)).toBe(false);',
      'packages/tools/src/check.ts': 'isEntityId(brandId);',
    });

    expect(checkOpaqueUserIds({ rootDir })).toEqual([
      {
        file: DTO_FILE,
        kind: 'entity-id-decorator',
        line: 3,
        name: 'userId',
      },
    ]);
  });
});
