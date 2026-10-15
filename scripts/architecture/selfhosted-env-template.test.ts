import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

function readEnvTemplate(relativePath: string): Map<string, string> {
  const values = new Map<string, string>();

  for (const line of readFileSync(
    path.join(REPO_ROOT, relativePath),
    'utf8',
  ).split('\n')) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match) {
      values.set(match[1], match[2]);
    }
  }

  return values;
}

type EnvTag = 'OPTIONAL' | 'REQUIRED';

const ENV_TEMPLATE_PATHS = ['docker/.env.example', '.env.example'];

function readText(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function readEnvTags(relativePath: string): Map<string, EnvTag | null> {
  const tags = new Map<string, EnvTag | null>();
  const lines = readText(relativePath).split('\n');

  lines.forEach((line, index) => {
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line);
    if (!match) {
      return;
    }

    const tagMatch = /^# (REQUIRED|OPTIONAL): \S/.exec(lines[index - 1] ?? '');
    tags.set(match[1], tagMatch ? (tagMatch[1] as EnvTag) : null);
  });

  return tags;
}

function requiredKeys(tags: Map<string, EnvTag | null>): string[] {
  return [...tags].filter(([, tag]) => tag === 'REQUIRED').map(([key]) => key);
}

describe('env template variable tags', () => {
  it.each(ENV_TEMPLATE_PATHS)(
    '%s tags every variable as REQUIRED or OPTIONAL on the line above it',
    (relativePath) => {
      const untagged = [...readEnvTags(relativePath)]
        .filter(([, tag]) => tag === null)
        .map(([key]) => key);

      expect(untagged).toEqual([]);
    },
  );
});

describe('self-hosted release env template (docker/.env.example)', () => {
  const template = readEnvTemplate('docker/.env.example');
  const raw = readText('docker/.env.example');

  it('marks OpenRouter as the only REQUIRED variable', () => {
    expect(requiredKeys(readEnvTags('docker/.env.example'))).toEqual([
      'OPENROUTER_API_KEY',
    ]);
  });

  it('documents that BETTER_AUTH_SECRET may stay empty and is auto-generated', () => {
    const lines = readText('docker/.env.example').split('\n');
    const secretLine = lines.indexOf('BETTER_AUTH_SECRET=');

    expect(secretLine).toBeGreaterThan(0);
    expect(lines[secretLine - 1]).toMatch(/^# OPTIONAL: .*May stay empty/);
    expect(lines[secretLine - 1]).toMatch(/\/data\/\.better-auth-secret/);
  });

  it('declares OPENROUTER_API_KEY so text generation can be configured', () => {
    expect(template.has('OPENROUTER_API_KEY')).toBe(true);
    expect(template.get('OPENROUTER_API_KEY')).toBe('');
  });

  it('documents that OpenRouter is required and that placeholders are rejected', () => {
    expect(raw).toMatch(/OPENROUTER_API_KEY is REQUIRED/);
    expect(raw).toMatch(/validates every key against the provider/);
  });

  it('enables sign-up out of the box with the existing flags', () => {
    expect(template.get('BETTER_AUTH_ENABLED')).toBe('true');
    expect(template.get('NEXT_PUBLIC_BETTER_AUTH_ENABLED')).toBe('true');
  });
});

describe('root env template (.env.example)', () => {
  it('groups every REQUIRED variable in the first section', () => {
    const raw = readText('.env.example');
    const requiredSection = raw.slice(0, raw.indexOf('# Shared Runtime'));
    const requiredInSection = Array.from(
      requiredSection.matchAll(/^([A-Z][A-Z0-9_]*)=/gm),
      (match) => match[1],
    );

    expect([...requiredInSection].sort()).toEqual(
      requiredKeys(readEnvTags('.env.example')).sort(),
    );
    expect(requiredInSection).toContain('DATABASE_URL');
    expect(requiredInSection).toContain('OPENROUTER_API_KEY');
  });

  it('leaves optional secrets empty instead of shipping placeholder values', () => {
    const template = readEnvTemplate('.env.example');

    expect(template.get('SENTRY_AUTH_TOKEN')).toBe('');
    expect(template.get('GENFEEDAI_WEBHOOKS_URL')).toBe('');
    expect(readText('.env.example')).not.toMatch(
      /your_sentry_auth_token|your-ngrok-url/,
    );
  });

  it('declares OPENROUTER_API_KEY alongside the other provider keys', () => {
    const template = readEnvTemplate('.env.example');

    expect(template.has('OPENROUTER_API_KEY')).toBe(true);
    expect(template.has('OPENAI_API_KEY')).toBe(true);
  });
});

describe('API host publishing', () => {
  it.each([
    [
      'docker/docker-compose.selfhosted.yml',
      /127\.0\.0\.1:\$\{SELFHOSTED_API_PORT:-3010\}:3010/,
    ],
    [
      'docker/docker-compose.yml',
      /127\.0\.0\.1:\$\{API_PORT:-3010\}:\$\{API_PORT:-3010\}/,
    ],
    [
      'docker/docker-compose.api.yml',
      /127\.0\.0\.1:\$\{API_PORT:-3010\}:\$\{API_PORT:-3010\}/,
    ],
  ])(
    '%s keeps the tokenless API off public host interfaces',
    (file, binding) => {
      const compose = readFileSync(path.join(REPO_ROOT, file), 'utf8');
      expect(compose).toMatch(binding);
    },
  );
});
