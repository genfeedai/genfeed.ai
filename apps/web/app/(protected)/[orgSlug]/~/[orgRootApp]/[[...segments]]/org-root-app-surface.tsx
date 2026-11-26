import EditorDetailSurface from '@app/(protected)/[orgSlug]/[brandSlug]/editor/[id]/editor-detail-surface';
import OutreachSequenceNewRoute from '@app/(protected)/[orgSlug]/[brandSlug]/messages/outreach/new/page';
import OutreachSequencesRoute from '@app/(protected)/[orgSlug]/[brandSlug]/messages/outreach/page';
import RepliesRoute from '@app/(protected)/[orgSlug]/[brandSlug]/messages/replies/page';
import ReplyDripRoute from '@app/(protected)/[orgSlug]/[brandSlug]/messages/reply-drip/page';
import {
  getBrandEntityId,
  getBrandOrganizationSlug,
} from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import {
  APP_ROUTES,
  createBrandAppRoute,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import { notFound, redirect } from 'next/navigation';
import BrandRequiredState from '@/components/states/BrandRequiredState';
import EditorWorkspace from '@/features/studio/editor/EditorWorkspace';
import type { OrgRootAppPageProps } from '@/props/layout/org-root-app-page.props';
import { loadProtectedBootstrap } from '@/server/protected-bootstrap.server';

/** Org entries of the brand-scoped former Studio apps, by route segment. */
const ORG_STUDIO_APP_ROUTES: Readonly<Record<string, string>> = {
  clipper: APP_ROUTES.STUDIO.CLIPPER,
  motion: APP_ROUTES.STUDIO.MOTION,
  playground: APP_ROUTES.STUDIO.PLAYGROUND,
  storyboard: APP_ROUTES.STUDIO.STORYBOARD,
  turbo: APP_ROUTES.STUDIO.TURBO,
};

// A bare `/:org/~/<app>` hit for a former Studio app (the app rail's brandless
// destination, #4671) still has a persisted last-used brand server-side even
// though the client brand context clears its own brandId on org-scoped routes.
// Resolve it here so the app itself is reachable instead of always bouncing to
// Agent.
// Validated against the operator's own brand list and this route's own org —
// a stale or deleted selection (or one from another organization) falls
// through to the existing Agent redirect below, unchanged.
async function resolveLastUsedStudioBrandSlug(
  orgSlug: string,
): Promise<string | null> {
  const bootstrap = await loadProtectedBootstrap();
  if (!bootstrap?.brandId) {
    return null;
  }

  const currentBrand = bootstrap.brands.find(
    (brand) =>
      getBrandEntityId(brand) === bootstrap.brandId &&
      getBrandOrganizationSlug(brand) === orgSlug,
  );

  return currentBrand?.slug ?? null;
}

async function renderStudioEditorSurface(section?: string) {
  // Reserved index segment: /~/editor/projects mirrors the Editor root
  // (the workspace). Without this guard it would fall into the detail branch below
  // and request an editor project with id 'projects'.
  if (section === 'projects') {
    return <EditorWorkspace />;
  }

  if (section) {
    return <EditorDetailSurface projectId={section} />;
  }

  return <EditorWorkspace />;
}

/**
 * The organization-level apps behind the dynamic `/:org/~/:app/*` segment.
 * Library and Publishing have their own static routes and surfaces, so their
 * features stay out of this route's client manifest. It reads the URL
 * (`params`) and redirects or 404s from it, so the page renders it inside a
 * Suspense boundary: the frame around it stays in the prerendered route shell.
 */
export default async function OrgRootAppSurface({
  params,
}: OrgRootAppPageProps) {
  const { orgRootApp, orgSlug, segments } = await params;

  // Org Workspace is a static `~/workspace/*` tree. The catch-all must not
  // own those destinations.
  if (orgRootApp === 'workspace') {
    notFound();
  }

  if (orgRootApp === 'automation') {
    // Deeper Automation pages own brand resources, but the brandless URL is a
    // valid navigation state. Keep the requested path mounted so the sidebar
    // remains usable and selecting a brand can reopen this exact surface.
    return (
      <BrandRequiredState
        brandSettingsHref={createOrganizationAppRoute(
          orgSlug,
          APP_ROUTES.SETTINGS.BRANDS,
        )}
      />
    );
  }

  // The Editor app's timeline surface. It mirrors the brand-scoped static
  // `editor` segment.
  if (orgRootApp === 'editor') {
    const [section] = segments ?? [];
    const editorSurface = await renderStudioEditorSurface(section);

    return <ErrorBoundary>{editorSurface}</ErrorBoundary>;
  }

  // Each former Studio app has brand-scoped production tooling (#5502). There
  // is no Studio parent: a bare `/studio` is not a route.
  const studioAppRoute = Object.hasOwn(ORG_STUDIO_APP_ROUTES, orgRootApp)
    ? ORG_STUDIO_APP_ROUTES[orgRootApp]
    : undefined;
  if (studioAppRoute) {
    if (segments?.length) {
      notFound();
    }

    // The app's org entry opens the operator's last-used brand (#4671).
    // Without one, one-off generation lives in Agent.
    const lastUsedBrandSlug = await resolveLastUsedStudioBrandSlug(orgSlug);
    if (lastUsedBrandSlug) {
      redirect(createBrandAppRoute(orgSlug, lastUsedBrandSlug, studioAppRoute));
    }

    redirect(createOrganizationAppRoute(orgSlug, APP_ROUTES.AGENT.NEW));
  }

  if (orgRootApp === 'messages') {
    const [section, detail] = segments ?? [];

    if (section === 'outreach' && detail === 'new') {
      return <OutreachSequenceNewRoute />;
    }

    if (section === 'outreach' && !detail) {
      return <OutreachSequencesRoute />;
    }

    if (section === 'replies' && !detail) {
      return <RepliesRoute />;
    }

    if (section === 'reply-drip' && !detail) {
      return <ReplyDripRoute />;
    }

    notFound();
  }

  notFound();
}
