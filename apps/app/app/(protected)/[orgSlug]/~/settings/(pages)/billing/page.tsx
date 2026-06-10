import { redirect } from 'next/navigation';

export default async function BillingRedirectPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  redirect(`/${orgSlug}/~/settings/organization/billing`);
}
