import { expect, test } from '@playwright/test';
import { playwrightApiEndpoint } from '../../config/environment';
import { installRecordedApi } from '../../utils/recorded-api/recorded-api';

/**
 * Plumbing proof for recorded API responses (#6231, #7426): replay serves the
 * committed recording, and a request the recording does not hold fails the
 * test naming the method and path.
 */
test.describe('recorded API replay (#7426)', () => {
  test('serves the recorded response and reports a clean run', async ({
    page,
  }) => {
    const recorded = await installRecordedApi(page, 'smoke-plumbing');
    await page.setContent('<body>plumbing</body>');

    const result = await page.evaluate(async (endpoint) => {
      const response = await fetch(`${endpoint}/system/ping`);
      return { body: await response.json(), status: response.status };
    }, playwrightApiEndpoint);

    expect(result.status).toBe(200);
    expect(result.body.data.attributes.ok).toBe(true);
    expect(() => recorded.assertAllRequestsMatched()).not.toThrow();
  });

  test('fails an injected unmatched request, naming method and path', async ({
    page,
  }) => {
    const recorded = await installRecordedApi(page, 'smoke-plumbing');
    await page.setContent('<body>plumbing</body>');

    const status = await page.evaluate(async (endpoint) => {
      const response = await fetch(`${endpoint}/not-recorded`, {
        method: 'POST',
      });
      return response.status;
    }, playwrightApiEndpoint);

    expect(status).toBe(599);
    expect(() => recorded.assertAllRequestsMatched()).toThrow(
      /POST \/not-recorded/u,
    );
  });
});
