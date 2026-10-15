import { PostStatus } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  generateMockPost,
  mockActiveSubscription,
  mockPostDetail,
  mockPostsList,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

for (const viewport of [
  { height: 844, width: 390 },
  { height: 900, width: 1440 },
]) {
  test(`post editor controls fit within the ${viewport.width}px viewport`, async ({
    authenticatedPage: page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
    await mockPostsList(page, []);
    await mockPostDetail(
      page,
      generateMockPost({
        description:
          '<p>A complete draft with enough text to verify that the editor wraps inside its visible column.</p>',
        id: 'post-responsive',
        label: 'Responsive draft',
        status: PostStatus.DRAFT,
      }),
    );
    await page.goto(
      brandPath(`${APP_ROUTES.PUBLISHING.POSTS}/post-responsive`),
      {
        waitUntil: 'domcontentloaded',
      },
    );

    const canvas = page.getByRole('region', {
      name: 'Primary workspace canvas',
      exact: true,
    });
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'Responsive draft' }),
    ).toBeVisible();
    // The first editable region is the post editor; the prompt bar has its own.
    const editor = canvas.locator('[contenteditable="true"]').first();
    await expect(editor).toBeVisible();
    const editorBounds = await editor.boundingBox();
    expect(editorBounds).not.toBeNull();
    expect(editorBounds?.x).toBeGreaterThanOrEqual(0);
    expect(
      (editorBounds?.x ?? 0) + (editorBounds?.width ?? 0),
    ).toBeLessThanOrEqual(viewport.width);

    // #6807: one docked prompt bar writes and rewrites; its input is labelled.
    const prompt = canvas.getByRole('textbox', {
      exact: true,
      name: 'Ask AI to write or rewrite',
    });
    await expect(prompt).toBeVisible();
    const promptBounds = await prompt.boundingBox();
    expect(promptBounds?.width).toBeGreaterThanOrEqual(120);
    await expect(
      canvas.getByRole('button', { name: 'Rewrite', exact: true }),
    ).toBeDisabled();
    await prompt.fill('QA layout check');
    await expect(
      canvas.getByRole('button', { name: 'Rewrite', exact: true }),
    ).toBeEnabled();
    for (const control of await canvas
      .locator('button, [role="combobox"]')
      .all()) {
      if (!(await control.isVisible())) continue;
      const bounds = await control.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds?.x).toBeGreaterThanOrEqual(0);
      expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(
        viewport.width,
      );
    }
    await page.screenshot({
      path: testInfo.outputPath('post-editor-controls.png'),
    });
    // Use the editor's select-all command: fill('') can send Delete before
    // ProseMirror has synchronized Playwright's DOM-only selection.
    await prompt.press('ControlOrMeta+A');
    await prompt.press('Backspace');
    await expect(prompt).toHaveText('');
    await expect(
      canvas.getByRole('button', { name: 'Rewrite', exact: true }),
    ).toBeDisabled();
    await expectNoErrorOverlay(page);
  });
}
