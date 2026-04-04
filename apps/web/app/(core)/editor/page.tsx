import { EditorPageClient } from '@/components/editor/EditorPageClient';

export default async function EditorPage({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string | string[] }>;
}) {
  const resolvedSearchParams = await searchParams;
  const launchAssets = Array.isArray(resolvedSearchParams.asset)
    ? resolvedSearchParams.asset
    : resolvedSearchParams.asset
      ? [resolvedSearchParams.asset]
      : [];

  return <EditorPageClient initialAssets={launchAssets} />;
}
