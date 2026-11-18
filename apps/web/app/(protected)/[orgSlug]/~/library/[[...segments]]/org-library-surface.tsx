import {
  LibraryPlace,
  PageScope,
  parseLibraryShelf,
} from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import IngredientsList from '@/features/ingredients/list/ingredients-list';
import LibraryBrowser from '@/features/library/browser/library-browser';
import { LIBRARY_TYPE_PRESETS } from '@/features/library/browser/library-browser.config';
import LibraryOverview from '@/features/library/overview/library-overview';
import VoiceStudio from '@/features/voice-studio/voice-studio';
import type { OrgRootAppEntryPageProps } from '@/props/layout/org-root-app-page.props';
import AssetDeepLink from '../../../[brandSlug]/library/assets/asset-deep-link';
import LibraryCaptionsPage from '../../../[brandSlug]/library/captions/page';
import ImportedLibrary from '../../../[brandSlug]/library/imported/imported-library';
import LibraryCharactersPage from '../../../[brandSlug]/library/references/content';
import LibraryVoicesPage from '../../../[brandSlug]/library/voices/library-voices-page';

const ORG_LIBRARY_PRESET_ROUTE_BY_SEGMENT: Readonly<Record<string, string>> = {
  avatars: APP_ROUTES.LIBRARY.AVATARS,
  gifs: APP_ROUTES.LIBRARY.GIFS,
  images: APP_ROUTES.LIBRARY.IMAGES,
  music: APP_ROUTES.LIBRARY.MUSIC,
  videos: APP_ROUTES.LIBRARY.VIDEOS,
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

/**
 * The organization Library behind `/:org/~/library/*`. Its own module keeps the
 * Library features out of every other organization app's client manifest.
 */
export default async function OrgLibrarySurface({
  params,
}: OrgRootAppEntryPageProps) {
  const { orgSlug, segments } = await params;

  if (!segments?.[0]) {
    redirect(createOrganizationAppRoute(orgSlug, APP_ROUTES.LIBRARY.OVERVIEW));
  }

  if (segments[0] === 'overview' && segments.length === 1) {
    return <LibraryOverview scope={PageScope.ORGANIZATION} />;
  }

  if (segments[0] === 'imported' && segments.length === 1) {
    return <ImportedLibrary scope={PageScope.ORGANIZATION} />;
  }

  if (segments[0] === 'references' && segments.length === 1) {
    return (
      <Suspense fallback={null}>
        <LibraryCharactersPage scope={PageScope.ORGANIZATION} />
      </Suspense>
    );
  }

  if (segments[0] === 'voices' && segments[1] === 'record') {
    return <VoiceStudio />;
  }

  if (segments[0] === 'voices') {
    return <LibraryVoicesPage scope={PageScope.ORGANIZATION} />;
  }

  if (segments[0] === 'captions') {
    return <LibraryCaptionsPage />;
  }

  return <OrgLibraryBrowserPage segments={segments} />;
}
