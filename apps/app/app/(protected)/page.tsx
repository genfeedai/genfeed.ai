import {
  getServerAuthToken,
  loadProtectedBootstrap,
} from '@app-server/protected-bootstrap.server';
import { OrganizationsService } from '@services/organization/organizations.service';
import { redirect } from 'next/navigation';
import { isSelfHosted } from '@/lib/config/edition';

export default async function ProtectedRootPage() {
  // Self-hosted: skip org resolution, use clean URLs (rewrites handle the mapping)
  if (isSelfHosted()) {
    redirect('/workspace/overview');
  }

  const bootstrap = await loadProtectedBootstrap();

  if (!bootstrap) {
    redirect('/login');
  }

  // Resolve the active org slug from the user's organizations
  const token = await getServerAuthToken();
  let orgSlug: string | null = null;
  if (token) {
    const orgsService = OrganizationsService.getInstance(token);
    const orgs = await orgsService.getMyOrganizations().catch(() => []);
    const activeOrg = orgs.find((o) => o.isActive) ?? orgs[0];
    if (activeOrg?.slug) {
      orgSlug = activeOrg.slug;
    }
  }

  const activeBrand =
    bootstrap.brands?.find((b) => b.id === bootstrap.brandId) ??
    bootstrap.brands?.[0];
  const brandSlug = activeBrand?.slug ?? null;

  if (!orgSlug || !brandSlug) {
    redirect('/onboarding/post-signup');
  }

  redirect(`/${orgSlug}/${brandSlug}/workspace/overview`);
}
