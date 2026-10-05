'use client';

import NewsletterEditorContent from '@app/(protected)/[orgSlug]/[brandSlug]/edit/newsletter/[id]/content';
import type { DetailPageProps } from '@props/pages/page.props';
import { useParams } from 'next/navigation';
import { readRouteParam } from '@/lib/route-params';

export default function NewsletterEditorRoute() {
  const params = useParams<Awaited<DetailPageProps['params']>>();
  const id = readRouteParam(params.id);

  return <NewsletterEditorContent artifactId={id} />;
}
