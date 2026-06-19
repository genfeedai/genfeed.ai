import { PageScope, PostStatus } from '@genfeedai/enums';
import IngredientsLayout from '@pages/ingredients/layout/ingredients-layout';
import IngredientsList from '@pages/ingredients/list/ingredients-list';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { SkeletonLoadingFallback } from '@ui/loading/skeleton/SkeletonFallbacks';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import WorkflowExecutionsPage from '@/features/workflows/pages/executions/WorkflowExecutionsPage';
import WorkflowLibraryPage from '@/features/workflows/pages/library/WorkflowLibraryPage';
import WorkflowTemplatesPage from '@/features/workflows/pages/templates/WorkflowTemplatesPage';
import EditorDetailPage from '../../../[brandSlug]/editor/[id]/page';
import EditorProjectsPage from '../../../[brandSlug]/editor/editor-projects-page';
import EditorNewPage from '../../../[brandSlug]/editor/new/page';
import { renderPostsListPage } from '../../../[brandSlug]/posts/posts-list-page';
import WorkflowDetailPageClient from '../../../[brandSlug]/workflows/[id]/WorkflowDetailPageClient';
import WorkflowNewPageClient from '../../../[brandSlug]/workflows/new/WorkflowNewPageClient';

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

function OrgWorkflowsPage({
  initialExecutionId,
  segments,
}: {
  initialExecutionId?: string;
  segments?: string[];
}) {
  const section = segments?.[0];

  if (section === 'templates') {
    return (
      <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
        <WorkflowTemplatesPage />
      </Suspense>
    );
  }

  if (section === 'executions') {
    return (
      <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
        <WorkflowExecutionsPage />
      </Suspense>
    );
  }

  if (section === 'new') {
    return <WorkflowNewPageClient />;
  }

  // Reserved index segment: /~/workflows/library mirrors the workflows root
  // (library). Without this guard it would fall into the detail branch below
  // and request a workflow with id 'library'.
  if (section === 'library') {
    return (
      <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
        <WorkflowLibraryPage />
      </Suspense>
    );
  }

  if (section) {
    return (
      <WorkflowDetailPageClient
        workflowId={section}
        initialExecutionId={initialExecutionId}
      />
    );
  }

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <WorkflowLibraryPage />
    </Suspense>
  );
}

export default async function OrgRootAppPage({
  params,
  searchParams,
}: OrgRootAppPageProps) {
  const { orgRootApp, segments } = await params;

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
    return <OrgIngredientListPage type={getOrgLibraryType(segments)} />;
  }

  if (
    orgRootApp === 'posts' ||
    orgRootApp === 'write' ||
    orgRootApp === 'compose'
  ) {
    return renderPostsListPage({
      searchParams: searchParams ?? Promise.resolve({}),
      scope: PageScope.ORGANIZATION,
      statusOverride: getOrgPostsStatusOverride(segments),
    });
  }

  if (orgRootApp === 'workflows') {
    const resolvedSearchParams = searchParams ? await searchParams : undefined;

    return (
      <OrgWorkflowsPage
        segments={segments}
        initialExecutionId={resolvedSearchParams?.execution}
      />
    );
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
