import type {
  IBrandKitDraft,
  IBrandOnboardingScan,
  IBrandOsExportState,
  IBrandOsRevision,
} from '@genfeedai/contracts/interfaces';
import type { Page } from '@playwright/test';
import { createPlaywrightApiRoutePattern } from '../config/environment';

/** BrandOsScan/Revision/Export controllers serialize one resource or a collection. */
export async function setupOnboardingBrandGuideMocks(
  page: Page,
): Promise<void> {
  const brandId = 'brand-1';
  const organizationId = 'mock-org-id-e2e-test';
  const timestamp = '2026-10-01T00:00:00.000Z';
  const content: IBrandKitDraft = {
    id: 'onboarding-guide',
    brandId,
    organizationId,
    status: 'ready',
    sourceType: 'manual',
    fields: {
      description: {
        key: 'description',
        label: 'Description',
        group: 'profile',
        ownerPath: 'brand.description',
        applyActionDefault: 'accept',
        proposedValue: 'A mock company for testing',
        evidence: [],
        diagnostics: [],
      },
    },
    assetCandidates: [],
    evidence: [],
    diagnostics: [],
    readiness: {
      status: 'complete',
      score: 1,
      requiredFields: [],
      missingFields: [],
      diagnostics: [],
    },
  };
  let revision: IBrandOsRevision = {
    id: 'onboarding-revision',
    brandId,
    organizationId,
    version: 1,
    exportSchemaVersion: '1',
    status: 'DRAFT',
    content,
    createdAt: timestamp,
    updatedAt: timestamp,
    approvedAt: null,
    approvedById: null,
  };
  let scan: IBrandOnboardingScan | null = null;
  const resource = (type: string, value: { id: string }) => ({
    type,
    id: value.id,
    attributes: value,
  });
  await page.route(
    createPlaywrightApiRoutePattern('brands/brand-1/brand-os/scan$'),
    async (route) => {
      if (route.request().method() === 'POST') {
        const request = route.request().postDataJSON() as {
          requestId: string;
          url: string;
        };
        scan = {
          id: request.requestId,
          brandId,
          status: 'ready',
          url: request.url,
          startedAt: timestamp,
          completedAt: timestamp,
          revisionId: revision.id,
        };
      }
      await route.fulfill({
        json: { data: scan ? resource('brand-onboarding-scan', scan) : null },
      });
    },
  );
  await page.route(
    createPlaywrightApiRoutePattern(
      'brands/brand-1/brand-os/revisions(?:/.*)?$',
    ),
    async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.endsWith('/approve')) {
        revision = {
          ...revision,
          status: 'APPROVED',
          approvedAt: timestamp,
          approvedById: 'mock-user-id-e2e-onboarding',
        };
      }
      const document = resource('brand-os-revision', revision);
      await route.fulfill({
        json: { data: pathname.endsWith('/revisions') ? [document] : document },
      });
    },
  );
  const exportState: IBrandOsExportState = {
    id: brandId,
    brandId,
    state: 'unavailable',
    schemaVersion: '1',
    revisionId: null,
    digest: null,
    generatedAt: null,
    publishedRevisionId: null,
    publishedAt: null,
    publicUrl: null,
    revisionUrl: null,
    canPublish: false,
  };
  await page.route(
    createPlaywrightApiRoutePattern('brands/brand-1/brand-os/export$'),
    (route) =>
      route.fulfill({
        json: { data: resource('brand-os-export', exportState) },
      }),
  );
}
