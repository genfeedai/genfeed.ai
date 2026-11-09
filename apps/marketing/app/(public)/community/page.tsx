import { getAppSignUpUrl } from '@data/app-links';
import { stringifyJsonLd } from '@data/json-ld';
import { buildModelCredits } from '@data/model-credits';
import { ButtonVariant, CardVariant } from '@genfeedai/contracts';
import {
  creatorProfilePath,
  GENFEED_BRAND_HANDLE,
} from '@genfeedai/contracts/constants';
import { getPublicModels } from '@public/models/models-loader';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import CommunityCreatorCard from '@web-components/creator/CommunityCreatorCard';
import CommunityFeaturedHero from '@web-components/creator/CommunityFeaturedHero';
import CommunityNav from '@web-components/creator/CommunityNav';
import CreatorArticleGrid from '@web-components/creator/CreatorArticleGrid';
import CreatorSection from '@web-components/creator/CreatorSection';
import HomeFooter from '@web-components/home/_footer';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';
import ProfileImages from '@web-components/profile/ProfileImages';
import ProfileVideos from '@web-components/profile/ProfileVideos';
import Link from 'next/link';
import '@styles/masonry.css';
import {
  buildCommunityJsonLd,
  COMMUNITY_DESCRIPTION,
  COMMUNITY_PATH,
} from './community-json-ld';
import { getCommunityPageData } from './community-loader';

export const revalidate = 300;

export const generateMetadata = createPageMetadataWithCanonical(
  'Community: Creators Publishing on Genfeed',
  COMMUNITY_DESCRIPTION,
  COMMUNITY_PATH,
);

export default async function CommunityPage(): Promise<React.ReactElement> {
  const [{ articles, creators, featured, images, videos }, catalog] =
    await Promise.all([getCommunityPageData(), getPublicModels()]);
  const modelCredits = buildModelCredits(catalog, [
    ...images,
    ...videos,
    ...(featured ? [featured.media] : []),
  ]);

  return (
    <>
      <script type="application/ld+json">
        {stringifyJsonLd(buildCommunityJsonLd({ articles, creators }))}
      </script>
      <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-12 sm:px-6">
        <header className="mx-auto mb-16 max-w-3xl text-center">
          <p className="mb-3 text-sm font-medium uppercase tracking-widest text-foreground/50">
            Community
          </p>
          <h1 className="mb-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Your portfolio lives at genfeed.ai/@you
          </h1>
          <p className="mb-8 text-lg text-foreground/70">
            Every creator on Genfeed gets a public profile with their articles,
            videos and images in one place, indexed by search engines and ready
            to share.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild withWrapper={false}>
              <a href={getAppSignUpUrl()}>Claim your handle</a>
            </Button>
            <Button
              asChild
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            >
              <Link href={creatorProfilePath(GENFEED_BRAND_HANDLE)}>
                See @{GENFEED_BRAND_HANDLE}
              </Link>
            </Button>
          </div>
        </header>

        <CommunityNav active="discover" />

        <div className="space-y-16">
          {featured ? (
            <CommunityFeaturedHero
              featured={featured}
              modelCredits={modelCredits}
            />
          ) : null}

          <section aria-labelledby="community-creators" className="space-y-4">
            <h2
              className="text-lg font-semibold text-foreground"
              id="community-creators"
            >
              Featured creators
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {creators.map((brand) => (
                <li key={brand.id}>
                  <CommunityCreatorCard brand={brand} />
                </li>
              ))}
              <li>
                <a className="group block h-full" href={getAppSignUpUrl()}>
                  <Card
                    isInteractive
                    variant={CardVariant.BORDERED}
                    className="flex h-full flex-col justify-center"
                  >
                    <div className="text-center">
                      <p className="text-base font-semibold text-foreground group-hover:text-primary">
                        Your profile here
                      </p>
                      <p className="text-sm text-foreground/60">
                        Publish your work and get a page at genfeed.ai/@you
                      </p>
                    </div>
                  </Card>
                </a>
              </li>
            </ul>
          </section>

          <CreatorSection
            href="/articles"
            title="Latest articles"
            total={articles.length}
          >
            <CreatorArticleGrid articles={articles} isBylineVisible />
          </CreatorSection>

          <CreatorSection
            href="/community/videos"
            title="Latest videos"
            total={videos.length}
          >
            <ProfileVideos modelCredits={modelCredits} videos={videos} />
          </CreatorSection>

          <CreatorSection
            href="/community/images"
            title="Latest images"
            total={images.length}
          >
            <ProfileImages images={images} modelCredits={modelCredits} />
          </CreatorSection>
        </div>
      </div>
      <HomeFooter />
    </>
  );
}
