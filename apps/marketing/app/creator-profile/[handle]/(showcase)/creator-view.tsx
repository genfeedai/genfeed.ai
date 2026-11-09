import { stringifyJsonLd } from '@data/json-ld';
import { buildModelCredits } from '@data/model-credits';
import {
  type CreatorProfileTab,
  creatorProfilePath,
  creatorTabPath,
} from '@genfeedai/contracts/constants';
import type {
  CreatorProfileView,
  CreatorTabCounts,
} from '@props/content/creator.props';
import { getPublicModels } from '@public/models/models-loader';
import { EnvironmentService } from '@services/core/environment.service';
import Pagination from '@ui/navigation/pagination/Pagination';
import CreatorArticleGrid from '@web-components/creator/CreatorArticleGrid';
import CreatorPostGrid from '@web-components/creator/CreatorPostGrid';
import CreatorProfileLayout from '@web-components/creator/CreatorProfileLayout';
import CreatorSection from '@web-components/creator/CreatorSection';
import ProfileEmptyState from '@web-components/profile/ProfileEmptyState';
import ProfileImages from '@web-components/profile/ProfileImages';
import ProfileVideos from '@web-components/profile/ProfileVideos';
import { notFound } from 'next/navigation';
import '@styles/masonry.css';
import {
  CREATOR_OVERVIEW_PAGE_SIZE,
  CREATOR_TAB_PAGE_SIZE,
  type CreatorProfileData,
  type CreatorShowcase,
  getCreatorProfileData,
} from './creator-loader';

const TAB_TOTAL_LABELS: Record<CreatorProfileTab, string> = {
  articles: 'articles',
  images: 'images',
  posts: 'posts',
  videos: 'videos',
};

/** Catalog labels for the models behind the showcase's images and videos. */
async function loadModelCredits(
  showcase: CreatorShowcase,
): Promise<Record<string, string>> {
  return buildModelCredits(await getPublicModels(), [
    ...showcase.images.items,
    ...showcase.videos.items,
  ]);
}

export function countShowcase(showcase: CreatorShowcase): CreatorTabCounts {
  return {
    articles: showcase.articles.total,
    images: showcase.images.total,
    posts: showcase.posts.total,
    videos: showcase.videos.total,
  };
}

function ProfileJsonLd({
  data,
  handle,
}: {
  data: CreatorProfileData;
  handle: string;
}): React.ReactElement {
  const { brand } = data;
  const url = `${EnvironmentService.apps.website}${creatorProfilePath(handle)}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    ...(brand.createdAt ? { dateCreated: brand.createdAt } : {}),
    mainEntity: {
      '@type': 'Organization',
      alternateName: `@${handle}`,
      ...(brand.description ? { description: brand.description } : {}),
      ...(brand.logoUrl ? { image: brand.logoUrl } : {}),
      name: brand.label?.trim() || `@${handle}`,
      url,
    },
    url,
  };

  return <script type="application/ld+json">{stringifyJsonLd(jsonLd)}</script>;
}

/** The "All" view: the newest few of every kind of public work. */
export async function CreatorOverview({
  handle,
}: {
  handle: string;
}): Promise<React.ReactElement> {
  const data = await getCreatorProfileData(handle, CREATOR_OVERVIEW_PAGE_SIZE);

  // An unknown or non-public handle answers a real 404, the same in both
  // cases, so a visitor cannot tell a private profile from a missing one.
  if (!data) {
    notFound();
  }

  const { brand, referralCode, showcase } = data;
  const canonicalHandle = brand.slug || handle;
  const counts = countShowcase(showcase);
  const modelCredits = await loadModelCredits(showcase);
  const isEmpty = Object.values(counts).every((count) => count === 0);

  return (
    <>
      <ProfileJsonLd data={data} handle={canonicalHandle} />
      <CreatorProfileLayout
        active={null}
        brand={brand}
        counts={counts}
        handle={canonicalHandle}
        referralCode={referralCode}
      >
        {isEmpty ? (
          <ProfileEmptyState handle={canonicalHandle} />
        ) : (
          <div className="space-y-12">
            <CreatorSection
              href={creatorTabPath(canonicalHandle, 'articles')}
              title="Articles"
              total={counts.articles}
            >
              <CreatorArticleGrid
                articles={showcase.articles.items}
                handle={canonicalHandle}
              />
            </CreatorSection>
            <CreatorSection
              href={creatorTabPath(canonicalHandle, 'videos')}
              title="Videos"
              total={counts.videos}
            >
              <ProfileVideos
                modelCredits={modelCredits}
                videos={showcase.videos.items}
              />
            </CreatorSection>
            <CreatorSection
              href={creatorTabPath(canonicalHandle, 'images')}
              title="Images"
              total={counts.images}
            >
              <ProfileImages
                images={showcase.images.items}
                modelCredits={modelCredits}
              />
            </CreatorSection>
            <CreatorSection
              href={creatorTabPath(canonicalHandle, 'posts')}
              title="Posts"
              total={counts.posts}
            >
              <CreatorPostGrid
                handle={canonicalHandle}
                posts={showcase.posts.items}
              />
            </CreatorSection>
          </div>
        )}
      </CreatorProfileLayout>
    </>
  );
}

/** One kind of public work, a page at a time. */
export async function CreatorTab({
  handle,
  page,
  tab,
}: {
  handle: string;
  page: number;
  tab: CreatorProfileTab;
}): Promise<React.ReactElement> {
  const data = await getCreatorProfileData(handle, CREATOR_TAB_PAGE_SIZE, page);

  if (!data) {
    notFound();
  }

  const { brand, referralCode, showcase } = data;
  const canonicalHandle = brand.slug || handle;
  const counts = countShowcase(showcase);
  const modelCredits = await loadModelCredits(showcase);
  const tabPage = showcase[tab];

  return (
    <CreatorProfileLayout
      active={tab satisfies CreatorProfileView}
      brand={brand}
      counts={counts}
      handle={canonicalHandle}
      referralCode={referralCode}
    >
      {tabPage.total === 0 ? (
        <ProfileEmptyState handle={canonicalHandle} />
      ) : (
        <>
          {tab === 'articles' ? (
            <CreatorArticleGrid
              articles={showcase.articles.items}
              handle={canonicalHandle}
            />
          ) : null}
          {tab === 'videos' ? (
            <ProfileVideos
              modelCredits={modelCredits}
              videos={showcase.videos.items}
            />
          ) : null}
          {tab === 'images' ? (
            <ProfileImages
              images={showcase.images.items}
              modelCredits={modelCredits}
            />
          ) : null}
          {tab === 'posts' ? (
            <CreatorPostGrid
              handle={canonicalHandle}
              posts={showcase.posts.items}
            />
          ) : null}
          <Pagination
            currentPage={tabPage.page}
            totalItems={tabPage.total}
            totalLabel={TAB_TOTAL_LABELS[tab]}
            totalPages={tabPage.totalPages}
          />
        </>
      )}
    </CreatorProfileLayout>
  );
}
