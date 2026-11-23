import type {
  IBrandKitDraft,
  IBrandOsRevision,
} from '@genfeedai/contracts/interfaces';
import type { Route } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';

const BRAND_KIT_VIDEO = '/test-org/brand-1/settings/brand-kit';
const APPROVED_DATE = '2026-11-12T10:00:00.000Z';

interface VideoBrand {
  id: string;
  isLutEnabled: boolean;
  label: string;
  lutFileName: string | null;
  slug: string;
  watermarkInsetXRatio: number;
  watermarkOpacity: number;
  watermarkPosition: string;
  watermarkSizeRatio: number;
  watermarkText: string | null;
}

function cube(size: number): string {
  const samples: string[] = [];
  for (let blue = 0; blue < size; blue++)
    for (let green = 0; green < size; green++)
      for (let red = 0; red < size; red++)
        samples.push(
          `${red / (size - 1)} ${green / (size - 1)} ${blue / (size - 1)}`,
        );
  return [`LUT_3D_SIZE ${size}`, ...samples].join('\n');
}

function approvedRevision(): IBrandOsRevision {
  return {
    approvedAt: APPROVED_DATE,
    approvedById: 'admin-1',
    brandId: 'brand-1',
    content: {
      assetCandidates: [],
      brandId: 'brand-1',
      diagnostics: [],
      evidence: [],
      fields: {},
      finishing: {
        endCard: { durationSeconds: 3, isEnabled: false },
        lut: { isEnabled: false },
        watermark: {
          insetXRatio: 0.096,
          opacity: 0.35,
          position: 'top-right',
          sizeRatio: 0.0667,
        },
      },
      id: 'draft-1',
      readiness: {
        diagnostics: [],
        missingFields: [],
        requiredFields: [],
        score: 100,
        status: 'complete',
      },
      sourceType: 'manual',
      status: 'ready',
    },
    createdAt: APPROVED_DATE,
    exportSchemaVersion: '1',
    id: 'revision-1',
    organizationId: 'mock-org-id-e2e-test',
    status: 'APPROVED',
    updatedAt: APPROVED_DATE,
    version: 1,
  };
}

function resource<T extends { id: string }>(value: T, type: string) {
  const { id, ...attributes } = value;
  return { attributes, id, type };
}

test.describe('Brand Kit video tab', () => {
  // Brand OS edits need an owner or admin; the default member role is read-only.
  test.use({ memberRole: 'admin' });

  let brand: VideoBrand;
  let revisions: IBrandOsRevision[];
  let brandWrites: string[];
  let savedContents: IBrandKitDraft[];

  test.beforeEach(async ({ authenticatedPage }) => {
    brand = {
      id: 'brand-1',
      isLutEnabled: false,
      label: 'Brand 1',
      lutFileName: null,
      slug: 'brand-1',
      watermarkInsetXRatio: 0.096,
      watermarkOpacity: 0.35,
      watermarkPosition: 'top-right',
      watermarkSizeRatio: 0.0667,
      watermarkText: null,
    };
    revisions = [approvedRevision()];
    brandWrites = [];
    savedContents = [];

    const respondBrand = (route: Route) =>
      route.fulfill({
        body: JSON.stringify({
          data: { attributes: brand, id: brand.id, type: 'brand' },
        }),
        contentType: 'application/json',
        status: 200,
      });
    await authenticatedPage.route('**/brands/slug**', respondBrand);
    await authenticatedPage.route('**/brands/brand-1', async (route) => {
      // The end card, colour grade and watermark change only through a revision.
      if (route.request().method() === 'PATCH') brandWrites.push('PATCH');
      await respondBrand(route);
    });
    await authenticatedPage.route('**/brands/brand-1/lut', async (route) => {
      const method = route.request().method();
      if (method === 'PUT') {
        const body = route.request().postDataBuffer()?.toString('utf8') ?? '';
        expect(body).toContain('name="file"');
        expect(body).toContain('filename="brand-look.cube"');
        expect(body).toContain('LUT_3D_SIZE 2');
        brandWrites.push('PUT brand-look.cube');
        brand = { ...brand, lutFileName: 'brand-look.cube' };
      } else if (method === 'DELETE') {
        brandWrites.push('DELETE');
        brand = { ...brand, isLutEnabled: false, lutFileName: null };
      }
      await respondBrand(route);
    });
    await authenticatedPage.route(
      '**/brands/brand-1/brand-os/**',
      async (route) => {
        const path = new URL(route.request().url()).pathname;
        const method = route.request().method();
        let data: unknown;
        if (path.endsWith('/revisions') && method === 'GET') {
          data = revisions.map((revision) =>
            resource(revision, 'brand-os-revisions'),
          );
        } else if (method === 'PATCH') {
          const body: { content: IBrandKitDraft } = route
            .request()
            .postDataJSON();
          savedContents.push(body.content);
          const saved: IBrandOsRevision = {
            ...revisions[0],
            approvedAt: null,
            approvedById: null,
            content: body.content,
            id: 'revision-2',
            status: 'DRAFT',
            updatedAt: '2026-11-12T11:00:00.000Z',
            version: 2,
          };
          revisions = [saved, ...revisions];
          data = resource(saved, 'brand-os-revisions');
        } else {
          data = null;
        }
        await route.fulfill({
          body: JSON.stringify({ data }),
          contentType: 'application/json',
          status: 200,
        });
      },
    );
  });

  test('saves a changed watermark placement as a draft revision, not on the brand', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(BRAND_KIT_VIDEO, {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    });

    const size = authenticatedPage.getByLabel('Size (% of width)');
    await expect(size).toHaveValue('6.67', { timeout: 30000 });
    await expect(
      authenticatedPage.getByLabel('From side edge (% of width)'),
    ).toHaveValue('9.6');

    await authenticatedPage
      .getByLabel('From top or bottom edge (% of width)')
      .fill('23.5');
    await authenticatedPage
      .getByRole('button', { name: 'Save draft', exact: true })
      .click();

    // The unsaved-changes bar leaves the page once the revision is saved.
    await expect(
      authenticatedPage
        .getByRole('status')
        .filter({ hasText: 'Unsaved revision changes' }),
    ).toHaveCount(0);
    await expect(
      authenticatedPage.getByRole('button', {
        name: 'Save draft',
        exact: true,
      }),
    ).toHaveCount(0);
    expect(savedContents).toHaveLength(1);
    expect(savedContents[0].finishing?.watermark).toMatchObject({
      insetXRatio: 0.096,
      insetYRatio: 0.235,
      position: 'top-right',
      sizeRatio: 0.0667,
    });
    expect(brandWrites).toEqual([]);
  });

  test('uploads a .cube straight to the brand, and the grade switch waits for a revision', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(BRAND_KIT_VIDEO, {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    });

    const toggle = authenticatedPage.getByRole('switch', {
      name: 'Colour grade (LUT)',
    });
    await expect(toggle).toBeDisabled({ timeout: 30000 });
    await expect(
      authenticatedPage.getByText('No LUT uploaded yet.'),
    ).toBeVisible();

    // A file that is not a .cube never leaves the browser.
    await authenticatedPage.getByLabel('Upload .cube file').setInputFiles({
      buffer: Buffer.from('not a lut'),
      mimeType: 'image/png',
      name: 'look.png',
    });
    await expect(
      authenticatedPage
        .getByRole('alert')
        .filter({ hasText: 'Choose a .cube file' }),
    ).toBeVisible();
    expect(brandWrites).toEqual([]);

    await authenticatedPage.getByLabel('Upload .cube file').setInputFiles({
      buffer: Buffer.from(cube(2)),
      mimeType: 'application/octet-stream',
      name: 'brand-look.cube',
    });
    await expect(authenticatedPage.getByText('brand-look.cube')).toBeVisible();
    await expect(toggle).toBeEnabled();
    await toggle.click();
    await expect(toggle).toBeChecked();
    // Switching the grade on is a draft change; no brand write happens.
    expect(brandWrites).toEqual(['PUT brand-look.cube']);

    await authenticatedPage
      .getByRole('button', { name: 'Remove LUT', exact: true })
      .click();
    await expect(
      authenticatedPage.getByText('No LUT uploaded yet.'),
    ).toBeVisible();
    await expect(toggle).not.toBeChecked();
    expect(brandWrites).toEqual(['PUT brand-look.cube', 'DELETE']);
  });
});
