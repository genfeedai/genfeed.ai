import { expect, test } from '@playwright/test';

/**
 * Liveness — secondary, documented as liveness-ONLY.
 *
 * `/v1/health/ready` is a STATIC `{ status }` body (health.controller.ts); it
 * proves the API process answers but says NOTHING about DB/seed/auth. The real
 * integration gate is api-integration.spec.ts (bootstrap). This spec only
 * guards against the API process being entirely absent.
 */

const apiBaseURL = process.env.API_BASE_URL || 'http://localhost:3010';

test.describe('Released image — liveness', () => {
  test('GET /v1/health/ready reports ready', async ({ request }) => {
    const response = await request.get(`${apiBaseURL}/v1/health/ready`);

    expect(response.status(), 'health endpoint must answer').toBe(200);

    const body = (await response.json()) as { status?: string };

    expect(body.status, 'health body must carry a status').toBe('ready');
  });
});
