export interface LegacyLibraryQueryRedirectProps {
  params: Promise<{ brandSlug: string; orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
