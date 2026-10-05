import IssueDetailRoute from '@app/(protected)/[orgSlug]/[brandSlug]/workspace/tasks/[id]/IssueDetailRoute';
import IssueDetailPage, * as PageModule from '@app/(protected)/[orgSlug]/[brandSlug]/workspace/tasks/[id]/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ id: 'TASK-123' }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: navigation.id }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));
vi.mock(
  '@app/(protected)/[orgSlug]/[brandSlug]/tasks/[id]/issue-detail',
  () => ({
    default: ({
      issueId,
      useIdentifier,
    }: {
      issueId: string;
      useIdentifier: boolean;
    }) => (
      <div data-testid="issue-detail">
        {issueId}:{String(useIdentifier)}
      </div>
    ),
  }),
);
runPageModuleTests('app/(protected)/workspace/tasks/[id]/page', PageModule);
describe('IssueDetailPage', () => {
  it('renders the requested task through its synchronous shell', () => {
    navigation.id = 'TASK-123';
    render(<IssueDetailPage />);
    expect(screen.getByTestId('issue-detail')).toHaveTextContent(
      'TASK-123:true',
    );
  });
  it('updates the task props when the URL param changes', () => {
    navigation.id = 'TASK-123';
    const { rerender } = render(<IssueDetailRoute />);
    navigation.id = 'opaque-task-id';
    rerender(<IssueDetailRoute />);
    expect(screen.getByTestId('issue-detail')).toHaveTextContent(
      'opaque-task-id:true',
    );
    navigation.id = 'opaqueid';
    rerender(<IssueDetailRoute />);
    expect(screen.getByTestId('issue-detail')).toHaveTextContent(
      'opaqueid:false',
    );
  });
});
