import { expect, test } from '@playwright/test';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

test.describe('framework overlay detection', () => {
  test('passes when a handled console error leaves a collapsed developer panel', async ({
    page,
  }) => {
    await page.setContent(`
      <main>Could not load posts. Try again.</main>
      <button>1 Issue</button>
      <div data-nextjs-dialog-overlay data-rendered="false" style="display:none">
        <div data-nextjs-dialog>Console Error: request failed</div>
      </div>
    `);

    await expect(page.locator('[data-nextjs-dialog]')).toHaveCount(1);
    await expect(expectNoErrorOverlay(page)).resolves.toBeUndefined();
  });

  test('fails when the framework error overlay is visible', async ({
    page,
  }) => {
    await page.setContent(`
      <main>Workspace</main>
      <div data-nextjs-dialog-overlay data-rendered="true">
        <div data-nextjs-dialog>Runtime Error: rendering failed</div>
      </div>
    `);

    await expect(expectNoErrorOverlay(page)).rejects.toThrow();
  });

  test('still fails when an application error boundary catches a crash', async ({
    page,
  }) => {
    await page.setContent(`
      <div data-testid="error-boundary-fallback">Something went wrong</div>
      <div data-nextjs-dialog-overlay style="display:none">
        <div data-nextjs-dialog>Console Error</div>
      </div>
    `);

    await expect(expectNoErrorOverlay(page)).rejects.toThrow(
      /rendered an application error boundary/,
    );
  });
});
