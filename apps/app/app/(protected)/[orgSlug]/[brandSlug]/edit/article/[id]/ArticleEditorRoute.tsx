'use client';

import ArticleEditorContent from '@app/(protected)/[orgSlug]/[brandSlug]/edit/article/[id]/content';
import type { DetailPageProps } from '@props/pages/page.props';
import { useParams } from 'next/navigation';
import { readRouteParam } from '@/lib/route-params';

export default function ArticleEditorRoute() {
  const params = useParams<Awaited<DetailPageProps['params']>>();
  const id = readRouteParam(params.id);

  return <ArticleEditorContent artifactId={id} />;
}
