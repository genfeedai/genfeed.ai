import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import IssueDetailPage, * as PageModule from './page';

vi.mock('./issue-detail', () => ({
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
}));

runPageModuleTests('app/(protected)/tasks/[id]/page', PageModule);

describe('IssueDetailPage', () => {
  it('renders the requested task detail surface', async () => {
    const page = await IssueDetailPage({
      params: Promise.resolve({ id: 'TASK-123' }),
    });

    render(page);

    expect(screen.getByTestId('issue-detail')).toHaveTextContent(
      'TASK-123:true',
    );
  });
});
