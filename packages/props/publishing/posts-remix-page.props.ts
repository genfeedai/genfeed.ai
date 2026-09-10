export type PostsRemixPageProps = {
  readonly params: Promise<{
    brandSlug: string;
    orgSlug: string;
  }>;
  readonly searchParams?: Promise<
    Record<string, string | string[] | undefined>
  >;
};
