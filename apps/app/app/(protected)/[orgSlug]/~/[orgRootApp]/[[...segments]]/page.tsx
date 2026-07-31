import { PageScope, PostStatus } from '@genfeedai/enums';
import IngredientsLayout from '@pages/ingredients/layout/ingredients-layout';
import IngredientsList from '@pages/ingredients/list/ingredients-list';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import FeatureGate from '@ui/guards/feature/FeatureGate';
import { SkeletonLoadingFallback } from '@ui/loading/skeleton/SkeletonFallbacks';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import EditorDetailPage from '../../../[brandSlug]/editor/[id]/page';
import EditorProjectsPage from '../../../[brandSlug]/editor/editor-projects-page';
import EditorNewPage from '../../../[brandSlug]/editor/new/page';
import PostsLayoutContent from '../../../[brandSlug]/posts/posts-layout-content';
import { renderPostsListPage } from '../../../[brandSlug]/posts/posts-list-page';
import StudioPageContent from '../../../[brandSlug]/studio/[type]/StudioPageContent';
import { canonicalizeStudioType } from '../../../[brandSlug]/studio/[type]/studio-route';

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
      <Suspense
        fallback={<SkeletonLoadingFallback type="masonry" count={12} />}
      >
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

  return undefined;
}

export default async function OrgRootAppPage({
  params,
  searchParams,
}: OrgRootAppPageProps) {
  const { orgRootApp, segments } = await params;

  if (orgRootApp === 'workspace' || orgRootApp === 'workflows') {
    // Hard cut: org-scoped workflows are gone; use brand /orchestration/workflows.
    notFound();
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
    // Studio generate surface — never the library ingredient browser.
    // Type comes from /~/studio/:type (e.g. music, video, image, avatar).
    const studioType = canonicalizeStudioType(segments?.[0]);

    return (
      <FeatureGate flagKey="studio">
        <ErrorBoundary>
          <StudioPageContent typeOverride={studioType} />
        </ErrorBoundary>
      </FeatureGate>
    );
  }

  if (
    orgRootApp === 'posts' ||
    orgRootApp === 'write' ||
    orgRootApp === 'compose'
  ) {
    const postsListPage = await renderPostsListPage({
      searchParams: searchParams ?? Promise.resolve({}),
      scope: PageScope.ORGANIZATION,
      statusOverride: getOrgPostsStatusOverride(segments),
    });

    return <PostsLayoutContent>{postsListPage}</PostsLayoutContent>;
  }

  if (orgRootApp === 'editor') {
    const section = segments?.[0];

    if (section === 'new') {
      return <EditorNewPage />;
    }

    // Reserved index segment: /~/editor/projects mirrors the editor root
    // (projects). Without this guard it would fall into the detail branch
    // below and request an editor project with id 'projects'.
    if (section === 'projects') {
      return <EditorProjectsPage />;
    }

    if (section) {
      return EditorDetailPage({
        params: Promise.resolve({ id: section }),
      });
    }

    return <EditorProjectsPage />;
  }

  notFound();
}
