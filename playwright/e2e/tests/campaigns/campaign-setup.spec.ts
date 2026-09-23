import { brandPath } from '@e2e/utils/app-chrome';
import {
  ContentCampaignStatus,
  CredentialPlatform,
} from '@genfeedai/contracts';
import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';

const campaignId = 'campaign-layout';
const campaignPath = `/publishing/campaigns/${campaignId}`;
const campaign = {
  attributes: {
    brandId: 'brand-1',
    brief:
      'Audience: content teams. Share a teaser, a walkthrough, and practical tips. Recommend LinkedIn for the walkthrough and X for short tips.',
    isDeleted: false,
    name: 'Launch our video editor',
    objective: 'Help content teams understand and try the video editor.',
    organizationId: 'org-1',
    status: ContentCampaignStatus.DRAFT,
  },
  id: campaignId,
  type: 'campaign',
};

async function mockCampaign(page: Page) {
  await page.route(/\/v1\/campaigns(?:\/[^?]*)?(?:\?.*)?$/, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/generate-plan')) {
      const body = route.request().postDataJSON();
      expect(body.name).toBeTruthy();
      expect(body.brandId).toBe('brand-1');
      expect(body.idempotencyKey).toBeTruthy();
      await route.fulfill({ json: { data: campaign } });
    } else if (path.endsWith(`/${campaignId}`)) {
      await route.fulfill({ json: { data: campaign } });
    } else {
      await route.fulfill({
        json: { data: [], meta: { page: 1, total: 0, totalPages: 1 } },
      });
    }
  });
  await page.route(/\/v1\/credentials(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      json: {
        data: [
          {
            attributes: {
              brandId: 'brand-1',
              externalHandle: 'genfeedai',
              isConnected: true,
              isDeleted: false,
              organizationId: 'org-1',
              platform: CredentialPlatform.LINKEDIN,
            },
            id: 'credential-linkedin',
            type: 'credential',
          },
        ],
        meta: { page: 1, total: 1, totalPages: 1 },
      },
    });
  });
}

test.describe('Campaign setup and responsive actions', () => {
  test('keeps actions reachable with the inspector open and on mobile', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await mockCampaign(page);
    for (const width of [1440, 1280, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(brandPath(campaignPath));
      await expect(
        page
          .getByRole('heading', { name: campaign.attributes.name, exact: true })
          .last(),
      ).toBeVisible();
      await expect(
        page.getByText('LinkedIn · genfeedai', { exact: true }),
      ).toBeVisible();
      const canvas = page.getByRole('region', {
        name: 'Primary workspace canvas',
      });
      if (width >= 1280) {
        await expect(
          page.getByRole('complementary', { name: 'Workspace inspector' }),
        ).toBeVisible();
        await page.getByRole('tab', { name: 'Chat', exact: true }).click();
      }
      const bounds = await canvas.boundingBox();
      if (!bounds) throw new Error('Campaign canvas has no visible bounds');
      for (const control of [
        page.getByRole('button', {
          name: 'Generate content with AI',
          exact: true,
        }),
        page.getByRole('button', { name: 'Start', exact: true }),
        page.getByRole('button', { name: 'Archive', exact: true }),
        page.getByRole('link', { name: 'Edit', exact: true }),
        page.getByRole('link', { name: /Back to campaigns/i, exact: true }),
      ]) {
        await expect(control).toBeVisible();
        const box = await control.boundingBox();
        if (!box) throw new Error('Campaign action has no visible bounds');
        expect(box.x).toBeGreaterThanOrEqual(bounds.x);
        expect(box.x + box.width).toBeLessThanOrEqual(
          bounds.x + bounds.width + 1,
        );
        await control.click({ trial: true });
      }
      await testInfo.attach(`campaign-${width}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      await page
        .getByRole('button', { name: 'Generate content with AI', exact: true })
        .click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('checkbox')).toHaveCount(1);
      await dialog.getByRole('checkbox').check();
      await expect(
        dialog.getByRole('button', {
          name: 'Generate content with AI',
          exact: true,
        }),
      ).toBeEnabled();
      await dialog
        .getByRole('button', { name: 'Close', exact: true })
        .first()
        .click();
    }
  });

  test('opens name-only creation with examples and shows the generated campaign', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await mockCampaign(page);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(brandPath('/publishing/campaigns/new'));
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /Product launch/ }).click();
    await expect(dialog.getByLabel('Campaign name or idea')).toHaveValue(
      /Launch our product/,
    );
    await expect(dialog.getByRole('textbox')).toHaveCount(1);
    await testInfo.attach('campaign-create-modal', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await dialog
      .getByRole('button', { name: 'Generate campaign with AI', exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${campaignId}$`));
    await expect(
      page.getByText(campaign.attributes.objective, { exact: true }).last(),
    ).toBeVisible();
  });
});
