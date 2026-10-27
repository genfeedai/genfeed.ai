import { AgentThreadMode } from '@genfeedai/contracts';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';
import { AgentPage } from '../../pages/agent.page';

/**
 * One prompt bar everywhere (#7778): the left group is mode, setup chips, then
 * the `+` that adds context, last. The right group is Enhance prompt and
 * submit only. Every icon-only control is the same 32px box with its glyph
 * centred, on one shared centre line.
 */

async function mockAgentShell(page: Page): Promise<void> {
  await page.route('**/agent/credits', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ balance: 120, modelCosts: { 'gpt-5-mini': 2 } }),
      contentType: 'application/json',
      status: 200,
    });
  });
  await page.route('**/runs/active', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ data: [] }),
      contentType: 'application/json',
      status: 200,
    });
  });
  await page.route(/\/threads(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      body: JSON.stringify({
        data: [],
        meta: { page: 1, pageSize: 0, totalCount: 0 },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

function toolbarGroups(page: Page): { left: Locator; right: Locator } {
  const toolbar = page.getByTestId('prompt-bar-toolbar').first();
  const left = toolbar.locator('[data-prompt-bar-leading]');
  return { left, right: left.locator('xpath=following-sibling::*[1]') };
}

async function buttonNames(group: Locator): Promise<(string | null)[]> {
  return group
    .locator('button')
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute('aria-label')),
    );
}

test.describe('Agent prompt bar', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockAgentShell(authenticatedPage);
  });

  test('keeps Enhance beside submit on the right and Add context last on the left', async ({
    authenticatedPage,
  }) => {
    const agentPage = new AgentPage(authenticatedPage);
    await agentPage.goto();
    await agentPage.chatInput.click();
    await agentPage.chatInput.pressSequentially('Plan next week');

    const { left, right } = toolbarGroups(authenticatedPage);
    const leftNames = await buttonNames(left);
    expect(leftNames.at(-1)).toBe('Add context');
    expect(leftNames).not.toContain('Enhance prompt');

    const rightNames = await buttonNames(right);
    expect(rightNames[0]).toBe('Enhance prompt');
    expect(rightNames).not.toContain('Add context');
  });

  test('centres every icon-only control in an equal box on one centre line', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.setViewportSize({ height: 800, width: 760 });
    const agentPage = new AgentPage(authenticatedPage);
    await agentPage.goto();
    await agentPage.chatInput.click();
    await agentPage.chatInput.pressSequentially('Plan next week');

    const toolbar = authenticatedPage.getByTestId('prompt-bar-toolbar').first();
    const metrics = await toolbar.locator('button').evaluateAll((buttons) =>
      buttons
        .filter((button) => (button.textContent ?? '').trim() === '')
        .map((button) => {
          const box = button.getBoundingClientRect();
          const glyph = button.querySelector('svg')?.getBoundingClientRect();
          return {
            glyphCenterX: glyph ? glyph.x + glyph.width / 2 : null,
            glyphCenterY: glyph ? glyph.y + glyph.height / 2 : null,
            glyphSize: glyph ? Math.round(glyph.width) : null,
            height: Math.round(box.height),
            label: button.getAttribute('aria-label'),
            width: Math.round(box.width),
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
          };
        }),
    );

    expect(metrics.length).toBeGreaterThan(3);
    const [first] = metrics;
    for (const control of metrics) {
      expect(control.label).toBeTruthy();
      expect(control.width).toBe(32);
      expect(control.height).toBe(32);
      expect(control.glyphSize).toBe(14);
      expect(Math.abs((control.glyphCenterX ?? 0) - control.x)).toBeLessThan(
        0.75,
      );
      expect(Math.abs((control.glyphCenterY ?? 0) - control.y)).toBeLessThan(
        0.75,
      );
      expect(Math.abs(control.y - first.y)).toBeLessThan(0.75);
    }
  });

  test('saves the picked agent mode for the thread and the default', async ({
    authenticatedPage,
  }) => {
    const saved: unknown[] = [];
    await authenticatedPage.route('**/agent/threads/mode', async (route) => {
      const body = route.request().postDataJSON() as { mode: string };
      saved.push(body.mode);
      await route.fulfill({
        body: JSON.stringify({ mode: body.mode }),
        contentType: 'application/json',
        status: 200,
      });
    });
    const agentPage = new AgentPage(authenticatedPage);
    await agentPage.goto();

    for (const [mode, label] of [
      [AgentThreadMode.AUTO, 'Auto'],
      [AgentThreadMode.PLAN, 'Plan'],
      [AgentThreadMode.MANUAL, 'Manual'],
    ] as const) {
      await agentPage.planModeButton.click();
      await authenticatedPage
        .getByRole('menuitemradio', { name: new RegExp(`^${label}`) })
        .click();
      await expect(agentPage.planModeButton).toHaveAccessibleName(
        `Agent mode: ${label}`,
      );
      await expect.poll(() => saved.at(-1)).toBe(mode);
    }
  });
});
