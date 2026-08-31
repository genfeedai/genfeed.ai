import { APP_ROUTES, createOrganizationAppRoute } from '@genfeedai/constants';
import { PageScope, PostStatus } from '@genfeedai/enums';
import IngredientsLayout from '@pages/ingredients/layout/ingredients-layout';
import IngredientsList from '@pages/ingredients/list/ingredients-list';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import FeatureGate from '@ui/guards/feature/FeatureGate';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import PublishLayoutContent from '../../../[brandSlug]/publish/publish-layout-content';
import { renderPostsListPage } from '../../../[brandSlug]/publish/publish-list-page';
import EditorDetailPage from '../../../[brandSlug]/studio/edit/[id]/page';
import EditorProjectsPage from '../../../[brandSlug]/studio/edit/editor-projects-page';
import EditorNewPage from '../../../[brandSlug]/studio/edit/new/page';

const ORG_LIBRARY_TYPE_BY_SEGMENT: Record<string, string> = {
  avatar: 'avatars',
  avatars: 'avatars',
  gif: 'gifs',
  gifs: 'gifs',
  image: 'images',
  images: 'images',
  ingredients: 'videos',
  music: 'musics',
  musics: 'musics',
  video: 'videos',
  videos: 'videos',
  voice: 'voices',
  voices: 'voices',
};

type OrgRootAppPageProps = {
  params: Promise<{
    orgRootApp: string;
    orgSlug: string;
    segments?: string[];
  }>;
  searchParams?: Promise<{
    execution?: string;
    page?: string;
    platform?: string;
    search?: string;
    sort?: string;
    status?: string;
  }>;
};

function getOrgLibraryType(segments?: string[]): string {
  return (
    ORG_LIBRARY_TYPE_BY_SEGMENT[segments?.[0] ?? 'ingredients'] ?? 'videos'
  );
}

function OrgIngredientListPage({
  hideTypeTabs = true,
  type,
}: {
  hideTypeTabs?: boolean;
  type: string;
}) {
  return (
    <IngredientsLayout
      scope={PageScope.ORGANIZATION}
      defaultType={type}
      hideTypeTabs={hideTypeTabs}
    >
      <Suspense fallback={null}>
        <IngredientsList type={type} scope={PageScope.ORGANIZATION} />
      </Suspense>
    </IngredientsLayout>
  );
}

function getOrgPostsStatusOverride(segments?: string[]) {
  const segment = segments?.[0];

  if (segment === 'published') {
    return PostStatus.PUBLIC;
  }

  if (segment === 'scheduled') {
    return PostStatus.SCHEDULED;
  }

  if (segment === 'pending') {
    return PostStatus.PENDING;
  }

  if (segment === 'processing') {
    return PostStatus.PROCESSING;
  }

  return undefined;
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

  if (orgRootApp === 'automate') {
    // Automate's only org-scoped surface is the cross-brand overview at
    // `/~/automate`; deeper automation paths are brand-scoped.
    redirect(createOrganizationAppRoute(orgSlug, APP_ROUTES.AUTOMATE.ROOT));
  }

  if (orgRootApp === 'library') {
    const type = getOrgLibraryType(segments);

    return (
      <OrgIngredientListPage
        type={type}
        hideTypeTabs={segments?.[0] !== undefined}
      />
    );
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

  if (orgRootApp === 'publish') {
    const postsListPage = await renderPostsListPage({
      searchParams: searchParams ?? Promise.resolve({}),
      scope: PageScope.ORGANIZATION,
      statusOverride: getOrgPostsStatusOverride(segments),
    });

    return <PublishLayoutContent>{postsListPage}</PublishLayoutContent>;
  }

  notFound();
}
