import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { redirect } from 'next/navigation';
import LabCronJobsPage, * as PageModule from './page';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

runPageModuleTests('app/(protected)/lab/cron-jobs/page', PageModule);

describe('LabCronJobsPage', () => {
  it('redirects legacy cron jobs lab traffic to workflows', async () => {
    await expect(
      LabCronJobsPage({
        params: {
          brandSlug: 'brand-1',
          orgSlug: 'test-org',
        },
      }),
    ).rejects.toThrow('redirect:/test-org/brand-1/workflows');

    expect(redirect).toHaveBeenCalledWith('/test-org/brand-1/workflows');
  });
});
