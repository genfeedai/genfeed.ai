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

  await adminPage.goto('/test-org/brand-1/settings/brand-kit');
  const openFromActions = async (name: string) => {
    await adminPage
      .getByRole('button', { name: 'Brand Kit actions', exact: true })
      .click();
    await adminPage.getByRole('menuitem', { name, exact: true }).click();
    return adminPage.getByRole('dialog');
  };

  // Export and publication live in the Share & export dialog.
  const share = await openFromActions('Share & export');
  await expect(
    share.getByRole('heading', { name: 'design.md · private' }),
  ).toBeVisible();
  const downloadEvent = adminPage.waitForEvent('download');
  await share
    .getByRole('button', { name: 'Download design.md', exact: true })
    .click();
  expect((await downloadEvent).suggestedFilename()).toBe('design.md');
  await share
    .getByRole('button', { name: 'Publish design.md', exact: true })
    .click();
  const publicLink = share.getByRole('link', {
    name: 'Open public design.md',
  });
  await expect(publicLink).toHaveAttribute(
    'href',
    'https://api.genfeed.ai/public/brand-os/test-token/design.md',
  );
  expect(publications).toEqual(['revision-1']);
  await adminPage.keyboard.press('Escape');

  // Fields are inline rows on the page; saving forks the approved revision.
  await adminPage
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill('New approved brand voice');
  await adminPage
    .getByRole('button', { name: 'Save draft', exact: true })
    .click();
  await adminPage
    .getByRole('button', { name: 'Review changes', exact: true })
    .first()
    .click();
  const approval = adminPage.getByRole('dialog');
  await expect(
    approval.getByRole('button', { name: 'Approve revision' }),
  ).toBeEnabled();
  await approval.getByRole('button', { name: 'Approve revision' }).click();
  await expect.poll(() => approvals).toEqual(['revision-2']);
  await adminPage.keyboard.press('Escape');

  const historyDialog = await openFromActions('Version history');
  const history = historyDialog.getByRole('combobox', {
    name: 'Revision history',
  });
  await expect(history).toContainText('Revision 2');
  await history.click();
  await adminPage.getByRole('option', { name: /Revision 1/ }).click();
  await expect(history).toContainText('Revision 1');
  await historyDialog.getByRole('button', { name: 'Refresh history' }).click();
  await expect(history).toContainText('Revision 2');
  await adminPage.keyboard.press('Escape');

  const publish = await openFromActions('Share & export');
  expect(publications).toEqual(['revision-1']);
  await publish.getByRole('button', { name: 'Update publication' }).click();
  await expect(
    publish.getByRole('button', { name: 'Update publication' }),
  ).toHaveCount(0);
  expect(publications).toEqual(['revision-1', 'revision-2']);
  await expect(
    publish.getByRole('link', { name: 'Open public design.md' }),
  ).toHaveAttribute(
    'href',
    'https://api.genfeed.ai/public/brand-os/test-token/design.md',
  );
  await publish.getByRole('button', { name: 'Revoke public access' }).click();
  await expect(
    publish.getByRole('heading', { name: 'design.md · revoked' }),
  ).toBeVisible();
  await expect(
    publish.getByRole('link', { name: 'Open public design.md' }),
  ).toHaveCount(0);
  await expect(
    publish.getByRole('button', { name: 'Download design.md', exact: true }),
  ).toBeEnabled();
});
