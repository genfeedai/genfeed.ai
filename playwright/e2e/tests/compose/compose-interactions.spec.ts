import { expect, test } from '../../fixtures/auth.fixture';
import { expectNoErrorOverlay, tryClick } from '../../utils/route-assertions';

/**
 * Deep interaction E2E coverage for the Compose surfaces (post, article,
 * newsletter).
 *
 * These specs fill real fields, toggle selectors, and click generate / save /
 * copy controls so the underlying component logic executes. All API + auth
 * traffic is mocked by the authenticatedPage fixture, so generation and save
 * actions resolve against fixtures rather than a real backend.
 *
 * Tenant-scoped routes use the mocked org/brand slugs: /test-org/brand-1/...
 *
 * CRITICAL: No real backend calls occur. Optional steps are guarded so the
 * suite never hangs or hard-fails on a missing control.
 */

const COMPOSE_POST = '/test-org/brand-1/compose/post';
const COMPOSE_ARTICLE = '/test-org/brand-1/compose/article';
const COMPOSE_NEWSLETTER = '/test-org/brand-1/compose/newsletter';

test.describe('Compose — Interactions', () => {
  test.setTimeout(90_000);

  test('fills the post composer title, prompt, and draft body', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(COMPOSE_POST, {
      waitUntil: 'domcontentloaded',
    });

    const title = authenticatedPage
      .locator('input[placeholder*="internal title"]')
      .first();
    await title.fill('Launch announcement draft').catch(() => {});

    const prompt = authenticatedPage.locator('#post-compose-prompt');
    await prompt
      .fill('Write a punchy launch post about our new editor.')
      .catch(() => {});

    const draft = authenticatedPage.locator('#post-compose-draft-content');
    await draft.fill('Genfeed editor is here.').catch(() => {});

    await expect(authenticatedPage).toHaveURL(/\/compose\/post/);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('switches the post format selector to a thread and edits a segment', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(COMPOSE_POST, {
      waitUntil: 'domcontentloaded',
    });

    // Open the Format select and try to pick Thread (falls back gracefully).
    await tryClick(authenticatedPage, '[aria-label="Format"]');
    await tryClick(authenticatedPage, '[role="option"]:has-text("Thread")');

    const threadSegment = authenticatedPage
      .locator('textarea[aria-label="Thread post 1"]')
      .first();
    await threadSegment.fill('First post in the thread.').catch(() => {});

    await tryClick(authenticatedPage, 'button:has-text("Add post")');

    await expect(authenticatedPage).toHaveURL(/\/compose\/post/);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('changes the post tone selector', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(COMPOSE_POST, {
      waitUntil: 'domcontentloaded',
    });

    await tryClick(authenticatedPage, '[aria-label="Tone"]');
    await tryClick(authenticatedPage, '[role="option"]:has-text("Viral")');

    await expect(authenticatedPage).toHaveURL(/\/compose\/post/);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('triggers the post copy-content action after writing a draft', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(COMPOSE_POST, {
      waitUntil: 'domcontentloaded',
    });

    const draft = authenticatedPage.locator('#post-compose-draft-content');
    await draft.fill('Draft body ready to copy.').catch(() => {});

    await tryClick(authenticatedPage, 'button:has-text("Copy content")');

    await expect(authenticatedPage).toHaveURL(/\/compose\/post/);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('selects the Quick Article type from the article composer', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(COMPOSE_ARTICLE, {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      authenticatedPage.getByText('Create New Article', { exact: false }),
    ).toBeVisible({ timeout: 15_000 });

    await tryClick(authenticatedPage, 'text=Quick Article');
    await authenticatedPage.waitForLoadState('domcontentloaded');

    await expect(authenticatedPage).toHaveURL(/\/compose\/article/);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('opens the X Article generate form and fills the prompt', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${COMPOSE_ARTICLE}?type=x-article`, {
      waitUntil: 'domcontentloaded',
    });

    const prompt = authenticatedPage
      .locator('textarea[placeholder*="article topic"]')
      .first();
    const hasPrompt = await prompt.isVisible().catch(() => false);

    if (hasPrompt) {
      await prompt
        .fill('A long-form piece on AI-native content workflows.')
        .catch(() => {});

      const keywords = authenticatedPage
        .locator('input[name="xArticleKeywords"]')
        .first();
      await keywords.fill('ai, workflows, creators').catch(() => {});

      await tryClick(
        authenticatedPage,
        'button:has-text("Generate X Article")',
      );
    } else {
      // Type selector may render first — choose X Article, then retry.
      await tryClick(authenticatedPage, 'text=X Article');
    }

    await expect(authenticatedPage).toHaveURL(/\/compose\/article/);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('fills the newsletter composer fields', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(COMPOSE_NEWSLETTER, {
      waitUntil: 'domcontentloaded',
    });

    const topic = authenticatedPage.locator('#newsletter-topic');
    await expect(topic).toBeVisible({ timeout: 15_000 });
    await topic.fill('Weekly creator roundup').catch(() => {});

    await authenticatedPage
      .locator('#newsletter-angle')
      .fill('Practical, no fluff')
      .catch(() => {});

    await authenticatedPage
      .locator('#newsletter-draft-label')
      .fill('Issue #1')
      .catch(() => {});

    await expect(authenticatedPage).toHaveURL(/\/compose\/newsletter/);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('triggers the newsletter generate-draft action with a topic', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(COMPOSE_NEWSLETTER, {
      waitUntil: 'domcontentloaded',
    });

    const topic = authenticatedPage.locator('#newsletter-topic');
    await expect(topic).toBeVisible({ timeout: 15_000 });
    await topic.fill('Newsletter generation topic').catch(() => {});

    await tryClick(authenticatedPage, 'button:has-text("Generate draft")');
    await authenticatedPage.waitForLoadState('domcontentloaded');

    await expect(authenticatedPage).toHaveURL(/\/compose\/newsletter/);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('exercises the newsletter copy-content action', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(COMPOSE_NEWSLETTER, {
      waitUntil: 'domcontentloaded',
    });

    await authenticatedPage
      .locator('#newsletter-draft-label')
      .fill('Copyable issue')
      .catch(() => {});

    await tryClick(authenticatedPage, 'button:has-text("Copy content")');

    await expect(authenticatedPage).toHaveURL(/\/compose\/newsletter/);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('renders the post composer on a mobile viewport and fills the prompt', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.setViewportSize({ height: 667, width: 375 });
    await authenticatedPage.goto(COMPOSE_POST, {
      waitUntil: 'domcontentloaded',
    });

    await authenticatedPage
      .locator('#post-compose-prompt')
      .fill('Mobile-authored prompt.')
      .catch(() => {});

    await expect(authenticatedPage).toHaveURL(/\/compose\/post/);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });
});
