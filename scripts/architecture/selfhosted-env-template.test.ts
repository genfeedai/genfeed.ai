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

describe('self-hosted release env template (docker/.env.example)', () => {
  const template = readEnvTemplate('docker/.env.example');
  const raw = readFileSync(path.join(REPO_ROOT, 'docker/.env.example'), 'utf8');

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
  it('declares OPENROUTER_API_KEY alongside the other provider keys', () => {
    const template = readEnvTemplate('.env.example');

    expect(template.has('OPENROUTER_API_KEY')).toBe(true);
    expect(template.has('OPENAI_API_KEY')).toBe(true);
  });
});
