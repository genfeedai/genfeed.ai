import { brandPath } from '@e2e/utils/app-chrome';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Locator, Page } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

// The setup lives in the prompt bar: a Type chip and an Auto / Advanced button,
// and in Advanced a row of chips (Model, Output, Look, Brand, Presets) that
// fold into a More setup menu when the bar is narrow. There is no popover, so
// these specs check that the bar and the menus it opens stay reachable.
function typeChip(page: Page): Locator {
  return page.getByRole('button', { name: /^Generation type: /, exact: false });
}

function modeButton(page: Page, mode: 'Advanced' | 'Auto'): Locator {
  return page.getByRole('button', {
    name: `Setup mode: ${mode}`,
    exact: true,
  });
}

// Model is the first chip on a wide bar and the first entry of More setup on a
// narrow one; either way something must reach it.
function modelEntry(chips: Locator): Locator {
  return chips
    .getByRole('button', { name: 'Configure Model', exact: true })
    .or(chips.getByRole('button', { name: 'More setup', exact: true }));
}

async function switchToAdvanced(page: Page): Promise<Locator> {
  // Keyboard activation avoids a resting pointer opening a hover menu.
  const auto = modeButton(page, 'Auto');
  await auto.focus();
  await auto.press('Enter');
  const chips = page.getByTestId('generation-setup-section-chips');
  await expect(modelEntry(chips)).toBeVisible();
  return chips;
}

async function openOutputMenu(page: Page, chips: Locator): Promise<void> {
  const outputChip = chips.getByRole('button', {
    name: 'Configure Output',
    exact: true,
  });
  if (await outputChip.isVisible()) {
    await outputChip.press('Enter');
    return;
  }
  await chips
    .getByRole('button', { name: 'More setup', exact: true })
    .press('Enter');
  await page.getByRole('menuitem', { name: /Output/ }).press('ArrowRight');
}

async function expectNoHorizontalPageScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const viewport of [
  { height: 844, width: 360 },
  { height: 844, width: 390 },
  { height: 1024, width: 768 },
  { height: 900, width: 1440 },
]) {
  for (const theme of ['light', 'dark', 'system'] as const) {
    test(`generation setup stays within the ${viewport.width}px viewport in ${theme}`, async ({
      authenticatedPage: page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({
        colorScheme: theme === 'light' ? 'light' : 'dark',
        reducedMotion: 'reduce',
      });
      await page.addInitScript(
        (selection) => localStorage.setItem('theme', selection),
        theme,
      );
      await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
      await page.goto(brandPath(APP_ROUTES.STUDIO.PLAYGROUND), {
        waitUntil: 'domcontentloaded',
      });

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('html')).toHaveAttribute(
        'data-theme',
        theme === 'light' ? 'light' : 'dark',
      );
      await expect(typeChip(page)).toBeVisible();
      await expect(modeButton(page, 'Auto')).toBeVisible();

      const chips = await switchToAdvanced(page);
      await expect(modeButton(page, 'Advanced')).toBeVisible();
      await expectNoHorizontalPageScroll(page);

      // The Output menu opens inside the viewport.
      await openOutputMenu(page, chips);
      const menu = page.getByRole('menu').last();
      await expect(menu).toBeVisible();
      await expect
        .poll(async () => {
          const bounds = await menu.boundingBox();
          return (
            bounds !== null &&
            bounds.x >= 0 &&
            bounds.x + bounds.width <= viewport.width
          );
        })
        .toBe(true)
        .catch(async (error) => {
          const info = await page.evaluate(() =>
            Array.from(document.querySelectorAll('[role="menu"]')).map((el) => {
              const r = el.getBoundingClientRect();
              return { cls: el.className.slice(0, 120), x: r.x, w: r.width, label: el.getAttribute('aria-label') };
            }),
          );
          throw new Error(`DIAG ${viewport.width} ${JSON.stringify(info)} ${error}`);
        });
      await page.screenshot({
        path: testInfo.outputPath('generation-setup-in-viewport.png'),
      });

      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu')).toHaveCount(0);
      await expectNoErrorOverlay(page);
    });
  }
}

// Browser zoom at 200% halves the CSS viewport and doubles rendered pixels.
// Keep this emulation explicit; screenshot dimensions retain the device width.
test.describe('200% browser zoom layout', () => {
  test.use({ deviceScaleFactor: 2 });
  for (const width of [360, 390, 768, 1440]) {
    test(`generation setup remains reachable at ${width}px physical width`, async ({
      authenticatedPage: page,
    }, testInfo) => {
      await page.setViewportSize({ width: width / 2, height: 600 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
      await page.goto(brandPath(APP_ROUTES.STUDIO.PLAYGROUND), {
        waitUntil: 'domcontentloaded',
      });
      await expect(typeChip(page)).toBeInViewport();
      const chips = await switchToAdvanced(page);
      await expectNoHorizontalPageScroll(page);
      // Nothing in the bar scrolls: when the tools run out of room the chips
      // fold into More setup and then wrap, so the way to Model has to be
      // fully on screen, not just a sliver of it.
      await expect(modelEntry(chips)).toBeInViewport({ ratio: 1 });
      await page.screenshot({
        path: testInfo.outputPath('generation-setup-200-percent.png'),
      });
    });
  }
});

test.describe('touch generation setup', () => {
  test.use({ hasTouch: true });
  test('retains a real 44px hit target around the 32px mode button', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
    await page.goto(brandPath(APP_ROUTES.STUDIO.PLAYGROUND), {
      waitUntil: 'domcontentloaded',
    });
    const advanced = modeButton(page, 'Auto');
    await expect(advanced).toBeVisible();
    // The prompt bar settles after first paint (editor and context row load),
    // and a tap before hydration is lost, so measure and tap together and
    // retry until Advanced is on.
    await expect(async () => {
      const target = await advanced.evaluate((element) => {
        const b = element.getBoundingClientRect();
        const pseudo = getComputedStyle(element, '::after');
        const x = b.x + b.width / 2;
        // Inside the 6px that `::after` extends above the 32px icon.
        const y = b.y - 3;
        const hit = document.elementFromPoint(x, y);
        return {
          width: b.width,
          height: b.height,
          hitWidth:
            b.width - parseFloat(pseudo.left) - parseFloat(pseudo.right),
          hitHeight:
            b.height - parseFloat(pseudo.top) - parseFloat(pseudo.bottom),
          isHitOnTrigger: hit !== null && element.contains(hit),
          hitDescription: `hit ${hit?.tagName}.${String(hit?.className).slice(0, 80)} at ${Math.round(x)},${Math.round(y)}; trigger ${JSON.stringify(b)}`,
          x,
          y,
        };
      });
      expect(target.width).toBeGreaterThanOrEqual(32);
      expect(target.height).toBeGreaterThanOrEqual(32);
      expect(target.hitWidth).toBeGreaterThanOrEqual(44);
      expect(target.hitHeight).toBeGreaterThanOrEqual(44);
      // An ancestor clipping the pseudo-element would hand the tap to
      // whatever sits above the button instead.
      expect(target.isHitOnTrigger, target.hitDescription).toBe(true);
      await page.touchscreen.tap(target.x, target.y);
      await expect(modeButton(page, 'Advanced')).toBeVisible({
        timeout: 3000,
      });
    }).toPass({ timeout: 20_000 });
  });
});
