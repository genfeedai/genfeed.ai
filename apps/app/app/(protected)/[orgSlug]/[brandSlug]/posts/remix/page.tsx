import LibraryRemixSurface from '@/features/library-remix/LibraryRemixSurface';
import { LIBRARY_REMIX_SOURCE_QUERY_KEY } from '@/features/library-remix/library-remix-reference';
import TrendRemixPage from './trend-remix-page';

type PostsRemixPageProps = {
  readonly searchParams?: Promise<
    Record<string, string | string[] | undefined>
  >;
};

const LEGACY_TREND_REMIX_QUERY_KEYS = [
  'sourceAuthor',
  'sourceReferenceId',
  'sourceText',
  'sourceUrl',
  'topic',
  'trendId',
] as const;

export default async function PostsRemixPage({
  searchParams,
}: PostsRemixPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const hasLegacyTrendIntent = LEGACY_TREND_REMIX_QUERY_KEYS.some((key) => {
    const value = resolvedSearchParams[key];
    return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
  });

  if (hasLegacyTrendIntent) {
    return <TrendRemixPage />;
  }

  const sourceArtifact = resolvedSearchParams[LIBRARY_REMIX_SOURCE_QUERY_KEY];
  const threadId = resolvedSearchParams.thread;

  if (typeof sourceArtifact !== 'string' || !sourceArtifact.trim()) {
    return (
      <LibraryRemixSurface
        sourceArtifact={null}
        threadId={typeof threadId === 'string' ? threadId : null}
      />
    );
  }

  return (
    <LibraryRemixSurface
      sourceArtifact={sourceArtifact}
      threadId={typeof threadId === 'string' ? threadId : null}
    />
  );
}
