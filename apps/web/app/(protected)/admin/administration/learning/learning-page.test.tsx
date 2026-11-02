import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LearningPage from './learning-page';

const mocks = vi.hoisted(() => ({
  brand: '',
  currentOrganizationId: 'org-own',
  organization: '',
  replace: vi.fn(),
  useLearningReport: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/administration/learning',
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () =>
    new URLSearchParams(
      mocks.organization ? { organization: mocks.organization } : {},
    ),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: mocks.currentOrganizationId }),
}));

vi.mock('@/components/content/admin-filters/AdminOrgBrandUrlFilter', () => ({
  default: () => <div>organization filter</div>,
  useAdminOrgBrandParams: () => ({
    brand: mocks.brand,
    organization: mocks.organization,
  }),
}));

vi.mock('@/features/admin/learning/use-learning-report', () => ({
  useLearningReport: mocks.useLearningReport,
}));

vi.mock('@ui/layout/admin-page-shell/AdminPageShell', () => ({
  default: ({
    children,
    dropdowns,
    title,
  }: {
    children: ReactNode;
    dropdowns?: ReactNode;
    title: string;
  }) => (
    <main>
      <h1>{title}</h1>
      {dropdowns}
      {children}
    </main>
  ),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../tests/next-intl.stub'
  );
  const translations = new Map<
    string,
    ReturnType<typeof translateFromCatalog>
  >();
  return {
    useTranslations: (namespace: string) => {
      if (!translations.has(namespace))
        translations.set(namespace, translateFromCatalog(namespace));
      return translations.get(namespace);
    },
  };
});

describe('LearningPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brand = '';
    mocks.currentOrganizationId = 'org-own';
    mocks.organization = '';
    mocks.useLearningReport.mockReturnValue({
      data: undefined,
      isError: false,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });
  });

  it('opens on the admin’s own organization instead of an empty form', () => {
    render(<LearningPage />);

    expect(mocks.replace).toHaveBeenCalledWith(
      '/admin/administration/learning?organization=org-own',
      { scroll: false },
    );
  });

  it('keeps the organization picked in the URL', () => {
    mocks.organization = 'org-picked';
    mocks.brand = 'brand-1';
    render(<LearningPage />);

    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.useLearningReport).toHaveBeenCalledWith({
      brandId: 'brand-1',
      organizationId: 'org-picked',
    });
  });

  it('asks for an organization when none is chosen yet', () => {
    mocks.currentOrganizationId = '';
    render(<LearningPage />);

    expect(
      screen.getByText(
        'Choose an organization to see which prompt slots go with better or worse results.',
      ),
    ).toBeVisible();
    expect(screen.getByText('organization filter')).toBeVisible();
  });
});
