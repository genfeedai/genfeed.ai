import {
  buildStudioPath,
  shouldRedirectStudioTypeRoute,
} from '@pages/studio/page/studio-route';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import { redirect } from 'next/navigation';
import StudioPageContent from './StudioPageContent';

type StudioTypePageProps = {
  params: Promise<{ type: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StudioTypePage({
  params,
  searchParams,
}: StudioTypePageProps) {
  const { type } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};

  if (shouldRedirectStudioTypeRoute(type, resolvedSearchParams)) {
    redirect(buildStudioPath(type, resolvedSearchParams));
  }

  return (
    <ErrorBoundary>
      <StudioPageContent />
    </ErrorBoundary>
  );
}
