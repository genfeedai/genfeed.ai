import {
  LibraryPlace,
  PageScope,
  parseLibraryShelf,
} from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import {
  CampaignDetailOverview,
  CampaignDetailPerformance,
  CampaignDetailShell,
  CampaignFormPage,
  CampaignsListPage,
} from '@pages/campaigns';
import IngredientsList from '@pages/ingredients/list/ingredients-list';
import LibraryBrowser from '@pages/library/browser/library-browser';
import { LIBRARY_TYPE_PRESETS } from '@pages/library/browser/library-browser.config';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import FeatureGate from '@ui/guards/feature/FeatureGate';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import LibraryCaptionsPage from '../../../[brandSlug]/library/captions/page';
import LibraryVoicesPage from '../../../[brandSlug]/library/voices/library-voices-page';
import ContentCalendarPage from '../../../[brandSlug]/publishing/calendar/content-calendar-page';
import PublishingLayoutContent from '../../../[brandSlug]/publishing/publishing-layout-content';
import {
  type PostsListSearchParams,
  renderPostsListPage,
} from '../../../[brandSlug]/publishing/publishing-list-page';
import EditorDetailPage from '../../../[brandSlug]/studio/edit/[id]/page';
import EditorProjectsPage from '../../../[brandSlug]/studio/edit/editor-projects-page';
import EditorNewPage from '../../../[brandSlug]/studio/edit/new/page';
import OrganizationAutomationBrandEmptyState from '../../automation/OrganizationAutomationBrandEmptyState';

const ORG_LIBRARY_PRESET_ROUTE_BY_SEGMENT: Readonly<Record<string, string>> = {
  avatars: APP_ROUTES.LIBRARY.AVATARS,
  gifs: APP_ROUTES.LIBRARY.GIFS,
  images: APP_ROUTES.LIBRARY.IMAGES,
  music: APP_ROUTES.LIBRARY.MUSIC,
  videos: APP_ROUTES.LIBRARY.VIDEOS,
};

const ORG_LIBRARY_CANONICAL_SEGMENT: Readonly<Record<string, string>> = {
  avatar: 'avatars',
  gif: 'gifs',
  image: 'images',
  musics: 'music',
  moodboard: 'assets',
  overview: 'assets',
  video: 'videos',
  voice: 'voices',
};

type OrgRootAppPageProps = {
  params: Promise<{
    orgRootApp: string;
    orgSlug: string;
    segments?: string[];
  }>;
  searchParams?: PostsListSearchParams;
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
      <Suspense fallback={null}>
        <IngredientsList
          folderNavigation="shell"
          type="ingredients"
          scope={PageScope.ORGANIZATION}
        />
      </Suspense>
    </LibraryBrowser>
  );
}

// Async because the detail surface is an async server component: it has to be
// awaited here, not handed to the tree as an unresolved promise child.
async function renderStudioEditSurface(section?: string) {
  if (section === 'new') {
    return <EditorNewPage />;
  }

  // Reserved index segment: /~/studio/edit/projects mirrors the edit root
  // (projects). Without this guard it would fall into the detail branch below
  // and request an editor project with id 'projects'.
  if (section === 'projects') {
    return <EditorProjectsPage />;
  }

  if (section) {
    return EditorDetailPage({ params: Promise.resolve({ id: section }) });
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
        <CampaignFormPage />
      </Suspense>
    );
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

  notFound();
}

export default async function OrgRootAppPage({
  params,
  searchParams,
}: OrgRootAppPageProps) {
  const { orgRootApp, orgSlug, segments } = await params;

  // Org Workspace is a static `~/workspace/*` tree. The catch-all must not
  // own those destinations (legacy hard-cut used to 404 them here).
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
    if (!segments?.[0] || segments[0] === 'ingredients') {
      redirect(createOrganizationAppRoute(orgSlug, APP_ROUTES.LIBRARY.ASSETS));
    }

    const canonicalSegment = ORG_LIBRARY_CANONICAL_SEGMENT[segments[0]];

    if (canonicalSegment) {
      redirect(
        createOrganizationAppRoute(
          orgSlug,
          `${APP_ROUTES.LIBRARY.ROOT}/${canonicalSegment}`,
        ),
      );
    }

    if (segments[0] === 'voices') {
      return <LibraryVoicesPage scope={PageScope.ORGANIZATION} />;
    }

    if (segments[0] === 'captions') {
      return <LibraryCaptionsPage />;
    }

    return <OrgLibraryBrowserPage segments={segments} />;
  }

  if (orgRootApp === 'studio') {
    // `edit` is Studio's timeline surface, not a generate type. It mirrors the
    // brand-scoped static `studio/edit` segment, which wins over `studio/[type]`.
    if (segments?.[0] === 'edit') {
      const editSurface = await renderStudioEditSurface(segments[1]);

      return (
        <FeatureGate flagKey="studio">
          <ErrorBoundary>{editSurface}</ErrorBoundary>
        </FeatureGate>
      );
    }

    // Studio's org-scoped one-off generation surface was retired. Studio
    // production tooling is brand-scoped; org-scoped generation lives in Agent.
    redirect(createOrganizationAppRoute(orgSlug, APP_ROUTES.AGENT.NEW));
  }

  if (orgRootApp === 'publishing') {
    const [section, campaignId, campaignSection] = segments ?? [];

    if (!section || section === 'overview' || section === 'posts') {
      const postsListPage = await renderPostsListPage({
        searchParams: searchParams ?? Promise.resolve({}),
        scope: PageScope.ORGANIZATION,
      });

      return <PublishingLayoutContent>{postsListPage}</PublishingLayoutContent>;
    }

    if (section === 'campaigns') {
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
