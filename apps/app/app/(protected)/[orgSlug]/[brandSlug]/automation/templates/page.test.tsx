import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { assertSourceHasExport } from '@shared/pages/sourceContractTestUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkflowTemplatesRedirectPage from './page';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => mocks.redirect(url),
}));

assertSourceHasExport(
  'app/(protected)/[orgSlug]/[brandSlug]/automation/templates/page.tsx',
);

describe('WorkflowTemplatesRedirectPage', () => {
  beforeEach(() => {
    mocks.redirect.mockClear();
  });

  it('sends the retired templates path onto the Workflows templates tab', async () => {
    await WorkflowTemplatesRedirectPage({
      params: Promise.resolve({
        brandSlug: 'shipshit',
        orgSlug: 'default-organization',
      }),
      searchParams: Promise.resolve({
        template: 'tpl-1',
      }),
    });

    expect(mocks.redirect).toHaveBeenCalledWith(
      `/default-organization/shipshit${APP_ROUTES.AUTOMATION.WORKFLOWS_TEMPLATES}?template=tpl-1`,
    );
  });
});
