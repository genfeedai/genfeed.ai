import { redirect } from 'next/navigation';

export default async function ApiKeysRedirectPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  redirect(`/${orgSlug}/~/settings/organization/api-keys`);
}
