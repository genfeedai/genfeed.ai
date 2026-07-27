import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import TasksPage, * as PageModule from './page';

vi.mock('@app/(protected)/[orgSlug]/[brandSlug]/tasks/issues-list', () => ({
  default: () => <div data-testid="issues-list" />,
}));

runPageModuleTests('app/(protected)/workspace/tasks/page', PageModule);

describe('TasksPage', () => {
  it('renders the tasks list surface', () => {
    render(<TasksPage />);

    expect(screen.getByTestId('issues-list')).toBeInTheDocument();
  });
});
