import BatchNewPage from '@app/(protected)/[orgSlug]/[brandSlug]/studio/batch/new/page';
import ClipsNewPage from '@app/(protected)/[orgSlug]/[brandSlug]/studio/clips/new/page';
import EditorNewPage from '@app/(protected)/[orgSlug]/[brandSlug]/studio/editor/new/page';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  organizationId: 'org-1',
  settingsLoading: false,
  settings: { hasOrganizationBilling: true, moduleOverrides: {} } as Record<
    string,
    unknown
  >,
  refreshSettings: vi.fn(),
  create: vi.fn(),
}));
vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => state,
}));
vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgHref: (path: string) => `/acme/~${path}` }),
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
vi.mock('@/features/workflows/pages/batch/BatchNewProjectPage', () => ({
  default: () => (
    <button type="button" onClick={state.create}>
      Create project
    </button>
  ),
}));
vi.mock(
  '@app/(protected)/[orgSlug]/[brandSlug]/studio/clips/new/new-clip-project-page',
  () => ({
    default: () => (
      <button type="button" onClick={state.create}>
        Create project
      </button>
    ),
  }),
);
vi.mock(
  '@app/(protected)/[orgSlug]/[brandSlug]/studio/editor/new/new-editor-project-page',
  () => ({
    default: () => (
      <button type="button" onClick={state.create}>
        Create project
      </button>
    ),
  }),
);
beforeEach(() => {
  state.settings = { hasOrganizationBilling: true, moduleOverrides: {} };
  state.create.mockClear();
});
describe('Studio creation routes', () => {
  it.each([
    ['batch', BatchNewPage],
    ['clips', ClipsNewPage],
    ['editor', EditorNewPage],
  ] as const)(
    'prevents %s creation until its organization preference is enabled',
    (moduleId, Page) => {
      const { rerender } = render(<Page />);
      expect(
        screen.queryByRole('button', { name: 'Create project' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Organization modules' }),
      ).toHaveAttribute('href', '/acme/~/settings/general');
      state.settings = {
        hasOrganizationBilling: true,
        moduleOverrides: { [moduleId]: true },
      };
      rerender(<Page />);
      fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
      expect(state.create).toHaveBeenCalledTimes(1);
    },
  );
});
