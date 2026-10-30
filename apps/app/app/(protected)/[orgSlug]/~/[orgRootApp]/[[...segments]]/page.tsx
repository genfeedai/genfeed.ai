import EditorDetailSurface from '@app/(protected)/[orgSlug]/[brandSlug]/editor/[id]/editor-detail-surface';
import PublishingContentEditorPage from '@app/(protected)/[orgSlug]/[brandSlug]/publishing/posts/[id]/PublishingContentEditorPage';
import { loadProtectedBootstrap } from '@app-server/protected-bootstrap.server';
import {
  getBrandEntityId,
  getBrandOrganizationSlug,
} from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import {
  LibraryPlace,
  PageScope,
  parseLibraryShelf,
  ViewType,
} from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createBrandAppRoute,
  createOrganizationAppRoute,
  resolveLegacyLibraryRoute,
} from '@genfeedai/contracts/constants';
import LibraryBrowser from '@pages/library/browser/library-browser';
import { LIBRARY_TYPE_PRESETS } from '@pages/library/browser/library-browser.config';
import LibraryOverview from '@pages/library/overview/library-overview';
import PublishingDeskViewToggle from '@pages/posts/library/publishing-desk-view-toggle';
import type { OrgRootAppPageProps } from '@props/layout/org-root-app-page.props';
import type { PostsListSearchParams } from '@props/publishing/publishing-list-page.props';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import { Suspense } from 'react';
import {
  CampaignDetailAds,
  CampaignDetailOverview,
  CampaignDetailPerformance,
  CampaignDetailShell,
  CampaignFormPage,
  CampaignsListPage,
} from '@/features/campaigns';
import IngredientsList from '@/features/ingredients/list/ingredients-list';
import EditorProjectsPage from '../../../[brandSlug]/editor/editor-projects-page';
import EditorNewPage from '../../../[brandSlug]/editor/new/page';
import AssetDeepLink from '../../../[brandSlug]/library/assets/asset-deep-link';
import LibraryCaptionsPage from '../../../[brandSlug]/library/captions/page';
import LibraryCreditNotice from '../../../[brandSlug]/library/library-credit-notice';
import LibraryVoicesPage from '../../../[brandSlug]/library/voices/library-voices-page';
import OutreachSequenceNewRoute from '../../../[brandSlug]/messages/outreach/new/page';
import OutreachSequencesRoute from '../../../[brandSlug]/messages/outreach/page';
import RepliesRoute from '../../../[brandSlug]/messages/replies/page';
import ReplyDripRoute from '../../../[brandSlug]/messages/reply-drip/page';
import ContentCalendarPage from '../../../[brandSlug]/publishing/calendar/content-calendar-page';
import PublishingCampaignComparePage from '../../../[brandSlug]/publishing/campaigns/compare/page';
import PublishingOverviewRoute from '../../../[brandSlug]/publishing/overview/page';
import PublishingLayoutContent from '../../../[brandSlug]/publishing/publishing-layout-content';
import { renderPostsListPage } from '../../../[brandSlug]/publishing/publishing-list-page';
import ReviewQueueContent from '../../../[brandSlug]/publishing/review/review-queue-content';
import OrganizationAutomationBrandEmptyState from '../../automation/OrganizationAutomationBrandEmptyState';

const ORG_LIBRARY_PRESET_ROUTE_BY_SEGMENT: Readonly<Record<string, string>> = {
  avatars: APP_ROUTES.LIBRARY.AVATARS,
  gifs: APP_ROUTES.LIBRARY.GIFS,
  images: APP_ROUTES.LIBRARY.IMAGES,
  music: APP_ROUTES.LIBRARY.MUSIC,
  videos: APP_ROUTES.LIBRARY.VIDEOS,
};

/** Org entries of the brand-scoped former Studio apps, by route segment. */
const ORG_STUDIO_APP_ROUTES: Readonly<Record<string, string>> = {
  clipper: APP_ROUTES.STUDIO.CLIPPER,
  motion: APP_ROUTES.STUDIO.MOTION,
  playground: APP_ROUTES.STUDIO.PLAYGROUND,
  storyboard: APP_ROUTES.STUDIO.STORYBOARD,
  turbo: APP_ROUTES.STUDIO.TURBO,
};

function OrgLibraryBrowserPage({ segments }: { segments: string[] }) {
  const [destination, shelfSegment] = segments;
  const place = Object.values(LibraryPlace).find(
    (candidate) => candidate === destination,
  );
  const shelf =
    destination === APP_ROUTES.LIBRARY.SHELF.split('/').at(-1)
      ? parseLibraryShelf(shelfSegment)
      : undefined;
  const presetRoute = ORG_LIBRARY_PRESET_ROUTE_BY_SEGMENT[destination];
  const preset = presetRoute ? LIBRARY_TYPE_PRESETS[presetRoute] : undefined;

  if (destination === 'shelf' && !shelf) {
    notFound();
  }

  if (!place && !shelf && !preset) {
    notFound();
  }

  return (
    <LibraryBrowser
      place={place}
      preset={preset}
      scope={PageScope.ORGANIZATION}
      seededCategories={preset?.categories}
      shelf={shelf}
    >
      {place === LibraryPlace.ASSETS ? <LibraryCreditNotice /> : null}
      <Suspense fallback={null}>
        {place === LibraryPlace.ASSETS ? <AssetDeepLink /> : null}
        <IngredientsList
          folderNavigation="shell"
          type="ingredients"
          scope={PageScope.ORGANIZATION}
        />
      </Suspense>
    </LibraryBrowser>
  );
}

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
  if (section === 'new') {
    return <EditorNewPage />;
  }

  // Reserved index segment: /~/editor/projects mirrors the Editor root
  // (projects). Without this guard it would fall into the detail branch below
  // and request an editor project with id 'projects'.
  if (section === 'projects') {
    return <EditorProjectsPage />;
  }

  if (section) {
    return <EditorDetailSurface projectId={section} />;
  }

  return <EditorProjectsPage />;
}

async function renderOrgCampaignSurface({
  campaignId,
  campaignSection,
  searchParams,
}: {
  campaignId?: string;
  campaignSection?: string;
  searchParams: PostsListSearchParams;
}) {
  if (!campaignId) {
    return (
      <Suspense fallback={null}>
        <CampaignsListPage />
      </Suspense>
    );
  }

  if (campaignId === 'new') {
    return (
      <Suspense fallback={null}>
        <CampaignsListPage isCreateOpen />
      </Suspense>
    );
  }

  if (campaignId === 'compare') {
    if (campaignSection) {
      notFound();
    }

    return <PublishingCampaignComparePage />;
  }

  if (!campaignSection) {
    return (
      <Suspense fallback={null}>
        <CampaignDetailShell campaignId={campaignId} section="overview">
          <CampaignDetailOverview campaignId={campaignId} />
        </CampaignDetailShell>
      </Suspense>
    );
  }

  if (campaignSection === 'edit') {
    return (
      <Suspense fallback={null}>
        <CampaignFormPage campaignId={campaignId} />
      </Suspense>
    );
  }

  if (campaignSection === 'content') {
    const postsListPage = await renderPostsListPage({
      campaignId,
      searchParams,
      scope: PageScope.ORGANIZATION,
    });

    return (
      <Suspense fallback={null}>
        <CampaignDetailShell campaignId={campaignId} section="content">
          {postsListPage}
        </CampaignDetailShell>
      </Suspense>
    );
  }

  if (campaignSection === 'calendar') {
    return (
      <Suspense fallback={null}>
        <CampaignDetailShell campaignId={campaignId} section="calendar">
          <ContentCalendarPage campaignId={campaignId} />
        </CampaignDetailShell>
      </Suspense>
    );
  }

  if (campaignSection === 'performance') {
    return (
      <Suspense fallback={null}>
        <CampaignDetailShell campaignId={campaignId} section="performance">
          <CampaignDetailPerformance campaignId={campaignId} />
        </CampaignDetailShell>
      </Suspense>
    );
  }

  if (campaignSection === 'ads') {
    return (
      <Suspense fallback={null}>
        <CampaignDetailShell campaignId={campaignId} section="ads">
          <CampaignDetailAds campaignId={campaignId} />
        </CampaignDetailShell>
      </Suspense>
    );
  }

  notFound();
}

export default async function OrgRootAppPage({
  params,
  searchParams,
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
    return <OrganizationAutomationBrandEmptyState orgSlug={orgSlug} />;
  }

  if (orgRootApp === 'library') {
    if (!segments?.[0]) {
      redirect(
        createOrganizationAppRoute(orgSlug, APP_ROUTES.LIBRARY.OVERVIEW),
      );
    }

    if (segments[0] === 'overview' && segments.length === 1) {
      return <LibraryOverview scope={PageScope.ORGANIZATION} />;
    }

    if (segments[0] === 'voices') {
      return <LibraryVoicesPage scope={PageScope.ORGANIZATION} />;
    }

    if (segments[0] === 'captions') {
      return <LibraryCaptionsPage />;
    }

    if (segments[0] === 'assets' && segments.length === 1) {
      // Old links carried the view in the query; each view is a route now.
      const legacyRoute = resolveLegacyLibraryRoute((await searchParams) ?? {});
      if (legacyRoute) {
        permanentRedirect(createOrganizationAppRoute(orgSlug, legacyRoute));
      }
    }

    return <OrgLibraryBrowserPage segments={segments} />;
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

  if (orgRootApp === 'publishing') {
    const publishingSegments = segments ?? [];
    const [section, campaignId, campaignSection] = publishingSegments;

    if (!section) {
      redirect(
        createOrganizationAppRoute(orgSlug, APP_ROUTES.PUBLISHING.OVERVIEW),
      );
    }

    if (publishingSegments.length === 1 && section === 'overview') {
      return (
        <PublishingLayoutContent>
          <PublishingOverviewRoute />
        </PublishingLayoutContent>
      );
    }

    if (publishingSegments.length === 1 && section === 'posts') {
      const postsListPage = await renderPostsListPage({
        searchParams: searchParams ?? Promise.resolve({}),
        scope: PageScope.ORGANIZATION,
      });

      return <PublishingLayoutContent>{postsListPage}</PublishingLayoutContent>;
    }

    if (publishingSegments.length === 1 && section === 'calendar') {
      return (
        <PublishingLayoutContent>
          <PublishingDeskViewToggle activeView={ViewType.CALENDAR} />
          <ContentCalendarPage embedded />
        </PublishingLayoutContent>
      );
    }

    if (section === 'approvals' && publishingSegments.length <= 3) {
      return (
        <PublishingLayoutContent>
          <PublishingDeskViewToggle activeView={ViewType.APPROVALS} />
          <ReviewQueueContent />
        </PublishingLayoutContent>
      );
    }

    if (publishingSegments.length === 2 && section === 'posts' && campaignId) {
      const detailPage = (
        <Suspense fallback={null}>
          <PublishingContentEditorPage contentId={campaignId} />
        </Suspense>
      );

      return <PublishingLayoutContent>{detailPage}</PublishingLayoutContent>;
    }

    if (section === 'campaigns') {
      const hasSurplusSegments =
        publishingSegments.length > 3 ||
        (campaignId === 'new' && publishingSegments.length > 2);

      if (hasSurplusSegments) {
        notFound();
      }

      return (
        <PublishingLayoutContent>
          {
            await renderOrgCampaignSurface({
              campaignId,
              campaignSection,
              searchParams: searchParams ?? Promise.resolve({}),
            })
          }
        </PublishingLayoutContent>
      );
    }

    notFound();
  }

  notFound();
}
