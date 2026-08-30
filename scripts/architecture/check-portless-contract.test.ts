import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkPortlessContract,
  parseEnvExample,
} from './check-portless-contract';

describe('Portless local-development contract guard', () => {
  it('keeps Portless as the repository default with direct fallbacks', () => {
    expect(checkPortlessContract()).toEqual([]);
  });

  it('parses CRLF env examples without retaining carriage returns', () => {
    const parsed = parseEnvExample(
      'NEXT_PUBLIC_API_URL=https://app.genfeed.localhost/v1\r\nAPI_URL=https://api.genfeed.localhost\r\n',
    );
    expect(parsed.NEXT_PUBLIC_API_URL).toBe('https://app.genfeed.localhost/v1');
    expect(parsed.API_URL).toBe('https://api.genfeed.localhost');
    expect(parsed.NEXT_PUBLIC_API_URL).not.toContain('\r');
    expect(parsed.API_URL).not.toContain('\r');
  });

  it('keeps the contributor database URL aligned with local Docker', () => {
    const environment = parseEnvExample(readFileSync('.env.example', 'utf8'));

    expect(environment.DATABASE_URL).toBe(
      'postgresql://genfeed:genfeed_local@localhost:5432/genfeed',
    );
  });

  it('keeps the local Docker Compose file free of obsolete version metadata', () => {
    const compose = readFileSync('docker/local/docker-compose.yml', 'utf8');

    expect(compose).not.toMatch(/^version:/mu);
  });

  it('declares each canonical environment key once', () => {
    const keys = readFileSync('.env.example', 'utf8')
      .split(/\r?\n/u)
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => line.slice(0, line.indexOf('=')));
    const duplicateKeys = keys.filter(
      (key, index) => keys.indexOf(key) !== index,
    );

    expect(duplicateKeys).toEqual([]);
  });
});
