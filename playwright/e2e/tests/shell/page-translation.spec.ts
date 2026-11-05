import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';
import { SettingsPage } from '../../pages/settings.page';
import { orgPath, orgSettingsRoute } from '../../utils/app-chrome';
import { assertRouteRenders } from '../../utils/route-assertions';

/**
 * Browser page translation (#9453, #9373). Chrome's translator replaces every
 * text node it translates with `<font><font>text</font></font>`. React still
 * holds the original text node, so the next update that removes or moves it
 * throws `removeChild` / `insertBefore ... not a child of this node`. The app
 * document opts out with `translate="no"`, which the translator honours per
 * element through the inherited `HTMLElement.translate` mode.
 *
 * `translateLikeChrome` mimics that translator: it wraps each non-blank text
 * node whose element is translatable and returns how many it wrapped. A probe
 * paragraph marked `translate="yes"` proves the mimic does translate content
 * that is not opted out, so a zero count for the app means the opt-out held.
 */
async function translateLikeChrome(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    const textNodes: Text[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const element = node.parentElement;
      if (
        element?.translate &&
        node.data.trim().length > 0 &&
        !['SCRIPT', 'STYLE'].includes(element.tagName)
      ) {
        textNodes.push(node);
      }
    }

    for (const node of textNodes) {
      const outer = document.createElement('font');
      const inner = document.createElement('font');
      inner.textContent = node.data;
      outer.append(inner);
      node.replaceWith(outer);
    }

    return textNodes.length;
  });
}

async function addTranslatableProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const probe = document.createElement('p');
    probe.dataset.translationProbe = 'true';
    probe.setAttribute('translate', 'yes');
    probe.textContent = 'Translation probe';
    document.body.append(probe);
  });
}

async function removeTranslatableProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelector('[data-translation-probe]')?.remove();
  });
}

function collectDomMismatchErrors(page: Page): string[] {
  const errors: string[] = [];
  const record = (message: string) => {
    if (/removeChild|insertBefore|not a child of this node/.test(message)) {
      errors.push(message);
    }
  };
  page.on('pageerror', (error) => record(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      record(message.text());
    }
  });
  return errors;
}

async function expectDocumentOptedOut(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('translate', 'no');
  await expect(page.locator('meta[name="google"]')).toHaveAttribute(
    'content',
    'notranslate',
  );
  expect(
    await page.evaluate(() => document.documentElement.translate),
  ).toBeFalsy();
}

test.describe('Browser page translation', () => {
  test.setTimeout(90_000);

  test('the agent conversation is left untranslated', async ({
    authenticatedPage,
  }) => {
    const domErrors = collectDomMismatchErrors(authenticatedPage);

    await assertRouteRenders(authenticatedPage, orgPath(APP_ROUTES.AGENT.NEW));
    await expectDocumentOptedOut(authenticatedPage);

    await addTranslatableProbe(authenticatedPage);
    expect(await translateLikeChrome(authenticatedPage)).toBe(1);
    await removeTranslatableProbe(authenticatedPage);

    expect(await translateLikeChrome(authenticatedPage)).toBe(0);
    expect(domErrors).toEqual([]);
  });

  test('account settings and subscription stay untranslated across navigation', async ({
    authenticatedPage,
  }) => {
    const domErrors = collectDomMismatchErrors(authenticatedPage);
    const settingsPage = new SettingsPage(authenticatedPage);

    // The replay's path: account settings, then the subscription link.
    await settingsPage.goto();
    await expectDocumentOptedOut(authenticatedPage);
    expect(await translateLikeChrome(authenticatedPage)).toBe(0);

    await settingsPage.settingsNav
      .getByRole('link', { exact: true, name: 'Notifications' })
      .click();
    await expect(authenticatedPage).toHaveURL(
      new RegExp(`${APP_ROUTES.SETTINGS.NOTIFICATIONS}$`),
    );
    expect(await translateLikeChrome(authenticatedPage)).toBe(0);

    await assertRouteRenders(
      authenticatedPage,
      orgSettingsRoute(APP_ROUTES.SETTINGS.SUBSCRIPTION),
    );
    await expectDocumentOptedOut(authenticatedPage);
    expect(await translateLikeChrome(authenticatedPage)).toBe(0);
    expect(domErrors).toEqual([]);
  });
});
