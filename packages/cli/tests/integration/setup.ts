/**
 * Integration test setup.
 *
 * Loads the real API key from ~/.gf/config.json so tests hit the
 * production API. All tests in this directory are skipped when no
 * key is present (CI without credentials, fresh dev machines, etc).
 */
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ofetch } from 'ofetch';

const CONFIG_PATH = path.join(os.homedir(), '.gf', 'config.json');

export interface TestConfig {
  apiKey: string;
  apiUrl: string;
  organizationId: string;
}

function loadTestConfig(): TestConfig | null {
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    const profileName = raw.activeProfile ?? 'default';
    const profile = raw.profiles?.[profileName];

    if (!profile?.apiKey) return null;

    return {
      apiKey: profile.apiKey,
      apiUrl: profile.apiUrl ?? 'https://api.genfeed.ai/v1',
      organizationId: profile.organizationId ?? '',
    };
  } catch {
    return null;
  }
}

export const testConfig = loadTestConfig();
export const hasCredentials = testConfig !== null && testConfig.apiKey.length > 0;

/**
 * Pre-configured ofetch instance with auth headers for integration tests.
 */
export function createTestClient() {
  if (!testConfig) throw new Error('No test config — tests should be skipped');

  return ofetch.create({
    baseURL: testConfig.apiUrl,
    headers: {
      Authorization: `Bearer ${testConfig.apiKey}`,
      'Content-Type': 'application/json',
    },
  });
}
