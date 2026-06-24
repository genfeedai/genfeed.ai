import { APP_ROUTES, createBrandAppRoute } from '@genfeedai/constants';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { redirect } from 'next/navigation';

export const generateMetadata = createPageMetadata('Cron Jobs');

interface LabCronJobsPageProps {
  params:
    | Promise<{
        brandSlug: string;
        orgSlug: string;
      }>
    | {
        brandSlug: string;
        orgSlug: string;
      };
}

export default async function LabCronJobsPage({
  params,
}: LabCronJobsPageProps) {
  const { brandSlug, orgSlug } = await params;

  redirect(createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.WORKFLOWS.ROOT));
}
