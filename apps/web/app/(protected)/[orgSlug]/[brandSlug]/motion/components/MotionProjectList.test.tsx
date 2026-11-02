import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MotionProjectList from './MotionProjectList';

const mocks = vi.hoisted(() => ({
  pages: [] as Array<{ projects: Array<Record<string, unknown>> }>,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@/../tests/next-intl.stub');
  return { useLocale: () => 'en', useTranslations: translateFromCatalog };
});
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ selectedBrand: { id: 'brand-1' } }),
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/moonrise${path}` }),
}));
vi.mock('@/hooks/data/content/use-visual-projects', () => ({
  useVisualProjects: () => ({
    projects: {
      data: { pages: mocks.pages },
      error: null,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetching: false,
      isFetchingNextPage: false,
      isLoading: false,
      refetch: vi.fn(),
    },
  }),
}));
vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    leading,
    refresh,
  }: {
    children: ReactNode;
    leading?: ReactNode;
    refresh?: ReactNode;
  }) => (
    <main>
      {leading}
      {refresh}
      {children}
    </main>
  ),
}));

const PROJECTS = [
  {
    currentRevision: 2,
    id: 'project-1',
    label: 'Spring launch title',
    revisions: [{ status: 'completed' }],
    updatedAt: '2026-10-01T10:00:00.000Z',
  },
  {
    currentRevision: 1,
    id: 'project-2',
    label: 'Logo sting',
    revisions: [{ status: 'failed' }],
    updatedAt: '2026-10-02T10:00:00.000Z',
  },
];

describe('MotionProjectList', () => {
  beforeEach(() => {
    mocks.pages = [{ projects: PROJECTS }];
  });

  it('lists each project as a link to its page with its latest status', () => {
    render(<MotionProjectList />);

    expect(
      screen.getByRole('link', { name: /Spring launch title/ }),
    ).toHaveAttribute('href', '/acme/moonrise/motion/project-1');
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('narrows the list to the projects matching the search', () => {
    render(<MotionProjectList />);

    const search = screen.getByRole('textbox', { name: 'Search projects' });
    fireEvent.change(search, { target: { value: 'logo' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(
      screen.queryByRole('link', { name: /Spring launch title/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Logo sting/ })).toBeVisible();
  });

  it('tells the creator to describe a project on the left when there are none', () => {
    mocks.pages = [{ projects: [] }];
    render(<MotionProjectList />);

    expect(screen.getByText('No Motion projects yet')).toBeVisible();
    expect(
      screen.getByText('Describe one on the left and it shows up here.'),
    ).toBeVisible();
  });
});
