import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { IImage, IVideo } from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers';
import { getPostMedia } from '@genfeedai/helpers/content/public-post.helper';
import type { Article } from '@models/content/article.model';
import type { CreatorTabCounts } from '@props/content/creator.props';
import { EnvironmentService } from '@services/core/environment.service';
import { BrandBanner } from '@ui/primitives/brand-banner';
import { UnderlineNav } from '@ui/primitives/underline-nav';
import CreatorArticleGrid from '@web-components/creator/CreatorArticleGrid';
import CreatorSection from '@web-components/creator/CreatorSection';
import CreatorWall from '@web-components/creator/CreatorWall';
import CreatorWallFilter from '@web-components/creator/CreatorWallFilter';
import {
  type ProtoDirection,
  ProtoProfileHeader,
} from '@web-components/creator/proto/ProtoProfileHeader';
import ProfileImages from '@web-components/profile/ProfileImages';
import ProfileVideos from '@web-components/profile/ProfileVideos';
import { notFound } from 'next/navigation';
import '@styles/masonry.css';
import { getCreatorProfileData } from '../creator-profile/[handle]/(showcase)/creator-loader';

export const dynamic = 'force-dynamic';

const HANDLE = 'itsshaylamonroe';
const TABS = ['all', 'posts', 'images', 'videos', 'articles'] as const;
type ProtoTab = (typeof TABS)[number];

const TAB_LABELS: Record<ProtoTab, string> = {
  all: 'Overview',
  articles: 'Articles',
  images: 'Images',
  posts: 'Posts',
  videos: 'Videos',
};

const ARTICLE_TITLES = [
  ['Why every carousel starts with the second slide', 'Instagram'],
  ['Three light setups that read as golden hour', 'Photography'],
  ['What a week of daily posting taught us', 'Strategy'],
] as const;

interface ProtoPageProps {
  searchParams: Promise<{ dir?: string; tab?: string }>;
}

export default async function ProtoProfilePage({
  searchParams,
}: ProtoPageProps): Promise<React.ReactElement> {
  const query = await searchParams;
  const direction = (
    ['a', 'b', 'c'].includes(query.dir ?? '') ? query.dir : 'a'
  ) as ProtoDirection;
  const tab = (TABS as readonly string[]).includes(query.tab ?? '')
    ? (query.tab as ProtoTab)
    : 'all';

  const data = await getCreatorProfileData(HANDLE, 24);
  if (!data) {
    notFound();
  }
  const { referralCode, showcase } = data;
  // Sample second account so the shared platform filter has something to filter.
  // Brand is a model with getters (bannerUrl, logoUrl); keep its prototype.
  const brand = Object.assign(
    Object.create(Object.getPrototypeOf(data.brand)),
    data.brand,
    {
      socials: [
        ...(data.brand.socials ?? []),
        {
          handle: HANDLE,
          platform: 'tiktok',
          url: `https://www.tiktok.com/@${HANDLE}`,
        },
      ],
    },
  ) as typeof data.brand;

  const photos = showcase.posts.items.flatMap((post) =>
    getPostMedia(post.ingredients),
  );
  const images = photos.map(
    (photo) =>
      ({
        id: `image-${photo.id}`,
        ingredientUrl: photo.url,
        metadata: { height: photo.height, label: 'Shayla', width: photo.width },
        status: IngredientStatus.GENERATED,
      }) as unknown as IImage,
  );
  const videos = photos.slice(0, 4).map(
    (photo, index) =>
      ({
        category: IngredientCategory.VIDEO,
        id: `video-${photo.id}`,
        ingredientUrl: '',
        metadata: { duration: 8 + index * 3, label: 'Shayla' },
        status: IngredientStatus.GENERATED,
        thumbnailUrl: photo.url,
      }) as unknown as IVideo,
  );
  const articles = ARTICLE_TITLES.map(
    ([label, category], index) =>
      ({
        category,
        coverImageUrl: photos[index * 2]?.url,
        id: `article-${index}`,
        label,
        publishedAt: new Date(Date.UTC(2026, 10, 20 - index * 3)).toISOString(),
        readingTime: 4 + index,
        slug: `sample-${index}`,
        summary:
          'A short note from the feed: what worked, what did not, and what we will repeat.',
      }) as unknown as Article,
  );

  const counts: CreatorTabCounts = {
    articles: articles.length,
    images: images.length,
    posts: showcase.posts.total,
    videos: videos.length,
  };
  const base = `/proto-profile?dir=${direction}`;
  const profileUrl = `${EnvironmentService.apps.website}/@${HANDLE}`;
  const label = brand.label?.trim() || `@${HANDLE}`;

  const nav = (
    <UnderlineNav
      ariaLabel="Profile sections"
      items={TABS.map((key) => ({
        badge:
          key === 'all' ? null : (
            <span className="text-foreground/40">{counts[key]}</span>
          ),
        href: `${base}&tab=${key}`,
        isActive: key === tab,
        label: TAB_LABELS[key],
      }))}
    />
  );

  const posts = (
    <CreatorWall brand={brand} handle={HANDLE} posts={showcase.posts.items} />
  );
  const content: React.ReactElement =
    tab === 'posts' ? (
      <div className="space-y-5">
        <CreatorWallFilter
          active={null}
          handle={HANDLE}
          platforms={[...new Set((brand.socials ?? []).map((s) => s.platform))]}
        />
        {posts}
      </div>
    ) : tab === 'images' ? (
      <ProfileImages images={images} />
    ) : tab === 'videos' ? (
      <ProfileVideos videos={videos} />
    ) : tab === 'articles' ? (
      <CreatorArticleGrid articles={articles} handle={HANDLE} />
    ) : (
      <div className="space-y-12">
        <CreatorSection
          href={`${base}&tab=posts`}
          title="Posts"
          total={counts.posts}
        >
          {posts}
        </CreatorSection>
        <CreatorSection
          href={`${base}&tab=images`}
          title="Images"
          total={counts.images}
        >
          <ProfileImages images={images.slice(0, 6)} />
        </CreatorSection>
        <CreatorSection
          href={`${base}&tab=videos`}
          title="Videos"
          total={counts.videos}
        >
          <ProfileVideos videos={videos} />
        </CreatorSection>
        <CreatorSection
          href={`${base}&tab=articles`}
          title="Articles"
          total={counts.articles}
        >
          <CreatorArticleGrid articles={articles} handle={HANDLE} />
        </CreatorSection>
      </div>
    );

  return (
    <div
      className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-16 pt-6 lg:px-6"
      data-direction={direction}
    >
      {brand.bannerUrl ? (
        <BrandBanner
          alt={`${label} banner`}
          className="sm:max-h-72"
          isPriority
          shape="rounded"
          sizes="(min-width: 1280px) 1152px, 100vw"
          src={brand.bannerUrl}
        />
      ) : null}
      <div
        className={cn(
          direction === 'c' &&
            'lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-10',
          direction !== 'c' && 'space-y-6',
        )}
      >
        <ProtoProfileHeader
          brand={brand}
          counts={counts}
          direction={direction}
          handle={HANDLE}
          hasBanner={Boolean(brand.bannerUrl)}
          profileUrl={profileUrl}
          referralCode={referralCode}
        />
        <div className="min-w-0 space-y-6 pt-6 lg:pt-0">
          <div
            className={direction === 'b' ? 'flex justify-center' : undefined}
          >
            <div className={direction === 'b' ? 'w-full max-w-fit' : 'w-full'}>
              {nav}
            </div>
          </div>
          {content}
        </div>
      </div>
    </div>
  );
}
