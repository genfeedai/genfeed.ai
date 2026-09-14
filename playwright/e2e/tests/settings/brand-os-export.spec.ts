import type {
  IBrandKitDraft,
  IBrandOsExportState,
  IBrandOsRevision,
} from '@genfeedai/contracts/interfaces';
import { expect, test } from '../../fixtures/auth.fixture';

const INITIAL_DATE = '2026-09-14T10:00:00.000Z';

function initialRevision(): IBrandOsRevision {
  return {
    exportSchemaVersion: '1',
    id: 'revision-1',
    brandId: 'brand-1',
    organizationId: 'mock-org-id-e2e-test',
    version: 1,
    status: 'APPROVED',
    approvedById: 'admin-1',
    approvedAt: INITIAL_DATE,
    createdAt: INITIAL_DATE,
    updatedAt: INITIAL_DATE,
    content: {
      id: 'draft-1',
      brandId: 'brand-1',
      status: 'ready',
      sourceType: 'manual',
      assetCandidates: [],
      evidence: [],
      diagnostics: [],
      fields: {
        description: {
          key: 'description',
          label: 'Description',
          group: 'profile',
          ownerPath: 'brand.description',
          currentValue: 'Approved brand voice',
          applyActionDefault: 'preserve',
          evidence: [],
          diagnostics: [],
        },
      },
      readiness: {
        status: 'complete',
        score: 100,
        missingFields: [],
        requiredFields: [],
        diagnostics: [],
      },
    },
  };
}

function resource<T extends { id: string }>(value: T, type: string) {
  const { id, ...attributes } = value;
  return { attributes, id, type };
}

test('Brand OS settings downloads privately, publishes, explicitly updates a new approval, and revokes', async ({
  adminPage,
}) => {
  let revisions = [initialRevision()];
  let exportState: IBrandOsExportState = {
    id: 'brand-1',
    brandId: 'brand-1',
    state: 'private',
    revisionId: 'revision-1',
    schemaVersion: '1',
    digest: 'private-digest',
    generatedAt: INITIAL_DATE,
    publishedRevisionId: null,
    publicUrl: null,
    revisionUrl: null,
    publishedAt: null,
    canPublish: true,
  };
  const publications: string[] = [];
  const approvals: string[] = [];
  await adminPage.route('**/brands/brand-1/brand-os/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    let data: unknown;
    if (path.endsWith('/design.md')) {
      expect(route.request().headers().authorization).toBeTruthy();
      await route.fulfill({
        status: 200,
        contentType: 'text/markdown',
        headers: { 'Content-Disposition': 'attachment; filename="design.md"' },
        body: '# Approved Brand\n',
      });
      return;
    }
    if (path.endsWith('/revisions') && method === 'GET') {
      data = revisions.map((revision) =>
        resource(revision, 'brand-os-revisions'),
      );
    } else if (path.endsWith('/export')) {
      data = resource(exportState, 'brand-os-exports');
    } else if (path.endsWith('/publication')) {
      if (method === 'DELETE') {
        exportState = {
          ...exportState,
          state: 'revoked',
          publicUrl: null,
          revisionUrl: null,
        };
      } else {
        const body: { revisionId: string } = route.request().postDataJSON();
        publications.push(body.revisionId);
        exportState = {
          ...exportState,
          state: 'published',
          publishedRevisionId: body.revisionId,
          publicUrl:
            'https://api.genfeed.ai/public/brand-os/test-token/design.md',
          publishedAt: INITIAL_DATE,
        };
      }
      data = resource(exportState, 'brand-os-exports');
    } else if (path.endsWith('/approve')) {
      const candidate = revisions[0];
      const body: { updatedAt: string } = route.request().postDataJSON();
      expect(body.updatedAt).toBe(candidate.updatedAt);
      approvals.push(candidate.id);
      const approved: IBrandOsRevision = {
        ...candidate,
        status: 'APPROVED',
        approvedAt: INITIAL_DATE,
      };
      revisions = [
        approved,
        ...revisions
          .slice(1)
          .map((revision) => ({ ...revision, status: 'SUPERSEDED' as const })),
      ];
      exportState = { ...exportState, revisionId: approved.id };
      data = resource(approved, 'brand-os-revisions');
    } else if (method === 'PATCH') {
      const body: { content: IBrandKitDraft; updatedAt: string } = route
        .request()
        .postDataJSON();
      expect(body.updatedAt).toBe(revisions[0].updatedAt);
      const saved: IBrandOsRevision = {
        ...revisions[0],
        id: 'revision-2',
        version: 2,
        status: 'DRAFT',
        content: body.content,
        approvedAt: null,
        approvedById: null,
        updatedAt: '2026-09-14T11:00:00.000Z',
      };
      revisions = [saved, ...revisions];
      data = resource(saved, 'brand-os-revisions');
    } else {
      throw new Error(`Unexpected Brand OS request: ${method} ${path}`);
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data }),
    });
  });

  await adminPage.goto('/test-org/brand-1/settings/kit');
  const settings = adminPage.getByTestId('brand-os-settings');
  await expect(
    settings.getByRole('heading', { name: 'design.md · private' }),
  ).toBeVisible();
  const downloadEvent = adminPage.waitForEvent('download');
  await settings
    .getByRole('button', { name: 'Download design.md', exact: true })
    .click();
  expect((await downloadEvent).suggestedFilename()).toBe('design.md');
  await settings
    .getByRole('button', { name: 'Publish design.md', exact: true })
    .click();
  const publicLink = settings.getByRole('link', {
    name: 'Open public design.md',
  });
  await expect(publicLink).toHaveAttribute(
    'href',
    'https://api.genfeed.ai/public/brand-os/test-token/design.md',
  );
  expect(publications).toEqual(['revision-1']);

  await settings
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill('New approved brand voice');
  await settings.getByRole('button', { name: 'Save as new draft' }).click();
  await expect(
    settings.getByRole('button', { name: 'Approve revision' }),
  ).toBeEnabled();
  await settings.getByRole('button', { name: 'Approve revision' }).click();
  await expect(
    settings.getByRole('button', { name: 'Update publication' }),
  ).toBeVisible();
  expect(approvals).toEqual(['revision-2']);
  expect(publications).toEqual(['revision-1']);
  await settings.getByRole('button', { name: 'Update publication' }).click();
  await expect(
    settings.getByRole('button', { name: 'Update publication' }),
  ).toHaveCount(0);
  expect(publications).toEqual(['revision-1', 'revision-2']);
  await expect(publicLink).toHaveAttribute(
    'href',
    'https://api.genfeed.ai/public/brand-os/test-token/design.md',
  );
  await settings.getByRole('button', { name: 'Revoke public access' }).click();
  await expect(
    settings.getByRole('heading', { name: 'design.md · revoked' }),
  ).toBeVisible();
  await expect(publicLink).toHaveCount(0);
  await expect(
    settings.getByRole('button', { name: 'Download design.md', exact: true }),
  ).toBeEnabled();
});
