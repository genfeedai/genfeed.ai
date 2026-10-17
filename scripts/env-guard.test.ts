import { describe, expect, it } from 'vitest';

import {
  findEnvTemplateDrift,
  isEnvTemplate,
  isForbiddenEnvFile,
  parseTemplateKeys,
} from './env-guard';

describe('isForbiddenEnvFile', () => {
  it.each([
    '.env',
    '.env.local',
    '.env.production',
    '.env.test',
    '.env.development',
    'apps/app/.env.staging',
    'apps/server/api/.env',
    'docker/.env',
  ])('rejects %s', (filePath) => {
    expect(isForbiddenEnvFile(filePath)).toBe(true);
  });

  it.each([
    '.env.example',
    'docker/.env.example',
    'apps/app/ENV.md',
    'apps/server/api/test/test.env',
    'scripts/env-check.ts',
  ])('allows %s', (filePath) => {
    expect(isForbiddenEnvFile(filePath)).toBe(false);
  });
});

describe('isEnvTemplate', () => {
  it('matches only .env.example files', () => {
    expect(isEnvTemplate('docker/.env.example')).toBe(true);
    expect(isEnvTemplate('.env.local')).toBe(false);
  });
});

describe('parseTemplateKeys', () => {
  it('reads active and commented-out keys but not prose', () => {
    const keys = parseTemplateKeys(
      [
        '# OPTIONAL: Port the API listens on.',
        'API_PORT=3010',
        '# DISABLED_FLAG=true',
        '#   SPACED_KEY=1',
        'lowercase=ignored',
        '',
      ].join('\n'),
    );

    expect([...keys].sort()).toEqual([
      'API_PORT',
      'DISABLED_FLAG',
      'SPACED_KEY',
    ]);
  });
});

describe('findEnvTemplateDrift', () => {
  const canonicalKeys = new Set(['DATABASE_URL', 'REDIS_URL', 'API_PORT']);

  it('reports no drift when template, sections and targets agree', () => {
    expect(
      findEnvTemplateDrift({
        canonicalKeys,
        targetKeys: new Set(['DATABASE_URL']),
        templateKeys: new Set(['DATABASE_URL', 'REDIS_URL']),
        exemptKeys: ['API_PORT'],
      }),
    ).toEqual({
      missingFromTemplate: [],
      targetKeysOutsideSections: [],
      unknownToSpec: [],
    });
  });

  it('reports keys on one side only', () => {
    expect(
      findEnvTemplateDrift({
        canonicalKeys,
        targetKeys: new Set(['DATABASE_URL', 'ORPHAN_TARGET_KEY']),
        templateKeys: new Set(['DATABASE_URL', 'ORPHAN_TEMPLATE_KEY']),
        exemptKeys: [],
      }),
    ).toEqual({
      missingFromTemplate: ['API_PORT', 'REDIS_URL'],
      targetKeysOutsideSections: ['ORPHAN_TARGET_KEY'],
      unknownToSpec: ['ORPHAN_TEMPLATE_KEY'],
    });
  });

  it('exempts the Portless-managed ports by default', () => {
    const drift = findEnvTemplateDrift({
      canonicalKeys: new Set(['API_PORT', 'WORKERS_PORT']),
      targetKeys: new Set(),
      templateKeys: new Set(),
    });

    expect(drift.missingFromTemplate).toEqual(['WORKERS_PORT']);
  });
});
