import { expect, test } from '@playwright/test';
import { exactUrlPattern } from '../../utils/exact-url';

test.describe('Exact chat thread URL assertions', () => {
  const baseUrl = 'https://app.example.test/test-org/agent/new';
  const threadRoute = '/test-org/agent/thread.a+b(1)';

  test('matches literal regex metacharacters in the expected URL', () => {
    const expectedUrl =
      'https://app.example.test/test-org/agent/thread.?view=[1](2){3}+*^$|&mode=plan+review#draft';
    const matcher = exactUrlPattern(expectedUrl, baseUrl);

    expect(expectedUrl).toMatch(matcher);
    expect(expectedUrl.replace('example.test', 'exampleXtest')).not.toMatch(
      matcher,
    );
    expect(expectedUrl.replace('thread.', 'threadX')).not.toMatch(matcher);
    expect(expectedUrl.replace('+review', 'review')).not.toMatch(matcher);
    expect(
      'https://app.example.test/test-org/agent/thread?view=\\draft',
    ).toMatch(
      exactUrlPattern(
        'https://app.example.test/test-org/agent/thread?view=\\draft',
        baseUrl,
      ),
    );
  });

  test('accepts the exact resolved URL through the Playwright assertion', async ({
    page,
  }) => {
    await page.route('**/*', (route) =>
      route.fulfill({ body: '<main>Thread</main>', contentType: 'text/html' }),
    );
    await page.goto(new URL(threadRoute, baseUrl).href);

    await expect(page).toHaveURL(exactUrlPattern(threadRoute, baseUrl));
  });

  for (const destination of [
    '/other-org/agent/thread.a+b(1)',
    `/prefix${threadRoute}`,
    threadRoute.replace('thread.', 'threadX'),
    threadRoute.replace('+b(1)', 'bb1'),
    `${threadRoute}-other`,
    `${threadRoute}/`,
    `${threadRoute}?view=plan`,
    `${threadRoute}#draft`,
  ]) {
    test(`rejects near-match destination ${destination}`, async ({ page }) => {
      await page.route('**/*', (route) =>
        route.fulfill({
          body: '<main>Thread</main>',
          contentType: 'text/html',
        }),
      );
      await page.goto(new URL(destination, baseUrl).href);

      await expect(page).not.toHaveURL(exactUrlPattern(threadRoute, baseUrl));
    });
  }

  test('rejects a different origin', () => {
    expect(`https://other.example.test${threadRoute}`).not.toMatch(
      exactUrlPattern(threadRoute, baseUrl),
    );
  });

  test('rejects a prefixed path even when the thread ID has no metacharacters', () => {
    const plainThreadRoute = '/test-org/agent/thread-agent-e2e';
    const matcher = exactUrlPattern(plainThreadRoute, baseUrl);

    expect(new URL(plainThreadRoute, baseUrl).href).toMatch(matcher);
    expect(new URL(`/prefix${plainThreadRoute}`, baseUrl).href).not.toMatch(
      matcher,
    );
  });
});
