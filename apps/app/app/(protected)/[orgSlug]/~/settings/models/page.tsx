import { redirect } from 'next/navigation';

// Bare /settings/models has no content of its own — send it to the first
// models tab. Also lets the "Models" sidebar entry point at /settings/models
// so it stays active across every model type route.
export default async function ModelsSettingsIndex({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  redirect(`/${orgSlug}/~/settings/models/all`);
}
