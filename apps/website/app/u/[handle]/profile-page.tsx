import type { ILink } from '@genfeedai/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import { addUTMParameters } from '@helpers/utm/utm-builder.helper';
import type { Article } from '@models/content/article.model';
import type { Image as ImageModel } from '@models/ingredients/image.model';
import type { Video } from '@models/ingredients/video.model';
import type { Brand } from '@models/organization/brand.model';
import type { Link as LinkModel } from '@models/social/link.model';
import NotFoundPage from '@pages/not-found/not-found-page';
import ProfileArticles from '@web-components/profile/ProfileArticles';
import ProfileFooter from '@web-components/profile/ProfileFooter';
import ProfileImages from '@web-components/profile/ProfileImages';
import ProfileSocialLinks from '@web-components/profile/ProfileSocialLinks';
import ProfileVideos from '@web-components/profile/ProfileVideos';
import '@styles/masonry.scss';
import Image from 'next/image';
import type { PublicProfilePageData } from './profile-loader';

interface ProfileContentProps {
  brand?: Brand;
  handle: string;
  links: LinkModel[];
  videos: Video[];
  images: ImageModel[];
  articles: Article[];
}

function ProfileContent({
  brand,
  handle,
  links,
  videos,
  images,
  articles,
}: ProfileContentProps): React.ReactElement {
  if (!brand) {
    return <NotFoundPage homeHref="/" homeLabel="Go to Home" />;
  }

  return (
    <div className="max-w-md mx-auto w-full space-y-6">
      <div className="relative">
        {brand.bannerUrl && (
          <div className="relative h-32 overflow-hidden bg-muted">
            <Image
              src={brand.bannerUrl}
              alt={`${brand.label} banner`}
              className="w-full h-full object-cover object-center"
              fill
              priority
            />
          </div>
        )}

        {brand.logoUrl && (
          <div
            className={cn(
              'w-24 h-24 rounded-full overflow-hidden flex-shrink-0 ring-4 ring-inv/50 bg-black',
              brand.bannerUrl
                ? 'absolute left-1/2 -translate-x-1/2 -bottom-12'
                : 'mx-auto',
            )}
          >
            <Image
              src={brand.logoUrl}
              alt={`${brand.label} logo`}
              className="w-full h-full object-cover"
              width={96}
              height={96}
              priority
            />
          </div>
        )}
      </div>

      <div
        className={cn(
          'flex flex-col items-center',
          brand.bannerUrl && brand.logoUrl ? 'pt-14' : 'pt-4',
        )}
      >
        <h1 className="text-xl font-bold mb-2 text-center text-surface">
          @{handle}
        </h1>

        {brand.description && (
          <p className="text-surface/70 text-sm text-center px-4">
            {brand.description}
          </p>
        )}
      </div>

      <ProfileSocialLinks
        handle={handle}
        youtubeUrl={brand.youtubeUrl}
        tiktokUrl={brand.tiktokUrl}
        instagramUrl={brand.instagramUrl}
        twitterUrl={brand.twitterUrl}
      />

      {links && links.length > 0 && (
        <div className="space-y-4">
          {links.map((link: ILink) => (
            <a
              key={link.id}
              href={addUTMParameters(link.url, handle)}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-fill/10 hover:bg-fill/20 backdrop-blur-sm text-surface rounded-full py-4 px-6 text-center font-medium transition-all border border-edge/[0.08] hover:border-edge/20"
            >
              {link.label}
            </a>
          ))}
        </div>
      )}

      <ProfileVideos videos={videos} />
      <ProfileImages images={images} />
      <ProfileArticles articles={articles} />

      <ProfileFooter />
    </div>
  );
}

export default function PublicProfileContent({
  handle,
  brand,
  videos,
  images,
  articles,
  links,
}: PublicProfilePageData & { handle: string }) {
  return (
    <div
      className="min-h-screen flex flex-col py-8 px-4"
      style={{ backgroundColor: brand?.backgroundColor || '#000' }}
    >
      <ProfileContent
        brand={brand ?? undefined}
        handle={handle}
        links={links}
        videos={videos}
        images={images}
        articles={articles}
      />
    </div>
  );
}
