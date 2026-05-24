import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import LabCronJobsPage, * as PageModule from './page';

vi.mock('@pages/agents/tasks/CronJobsList', () => ({
  default: () => <div data-testid="cron-jobs-list" />,
}));

runPageModuleTests('app/(protected)/lab/cron-jobs/page', PageModule);

describe('LabCronJobsPage', () => {
  it('renders the cron jobs lab surface', () => {
    render(<LabCronJobsPage />);

    expect(screen.getByTestId('cron-jobs-list')).toBeInTheDocument();
  });
});
