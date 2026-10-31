import { assertSourceHasExport } from '@shared/pages/sourceContractTestUtils';
import WorkflowDetailPage from './page';

const mockNotFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});

vi.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
}));

vi.mock('./WorkflowDetailPageClient', () => ({
  default: () => null,
}));

assertSourceHasExport(
  'app/(protected)/[orgSlug]/[brandSlug]/automation/workflows/[id]/page.tsx',
);

it.each(['executions', 'templates'])(
  'hard-cuts the retired nested workflow path %s',
  async (id) => {
    await expect(
      WorkflowDetailPage({
        params: Promise.resolve({ id }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  },
);
