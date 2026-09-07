import { redirect } from 'next/navigation';

export default async function PostsCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; brandSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgSlug, brandSlug } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value ? [value] : [])
      query.append(key, item);
  }
  query.set('view', 'calendar');
  redirect(
    `/${encodeURIComponent(orgSlug)}/${encodeURIComponent(brandSlug)}/publishing/posts?${query}`,
  );
}
