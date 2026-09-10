import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { BrandAppPageProps } from '@props/pages/page.props';
import { redirect } from 'next/navigation';

export const generateMetadata = createPageMetadata('Workflow Templates');

function toQueryString(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string' && value.length > 0) {
      params.set(key, value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item);
      }
    }
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

export default async function WorkflowTemplatesRedirectPage({
  params,
  searchParams,
}: BrandAppPageProps) {
  const { brandSlug, orgSlug } = await params;
  const query = searchParams ? await searchParams : {};
  redirect(
    `/${orgSlug}/${brandSlug}${APP_ROUTES.AUTOMATION.WORKFLOWS_TEMPLATES}${toQueryString(query)}`,
  );
}
