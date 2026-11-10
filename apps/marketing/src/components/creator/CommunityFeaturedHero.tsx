'use client';

import { modelCatalogHref } from '@data/model-credits';
import {
  buildRecreateHref,
  buildRecreatePrompt,
  mediaModelKey,
  publicMediaUrl,
} from '@data/public-media';
import { trackRecreation } from '@data/public-views';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  creatorProfilePath,
  creatorTabPath,
} from '@genfeedai/contracts/constants';
import type { IImage, IVideo } from '@genfeedai/contracts/interfaces';
import type { CommunityFeaturedHeroProps } from '@props/content/creator.props';
import {
  LazyMasonryImage,
  LazyMasonryVideo,
} from '@ui/lazy/masonry/LazyMasonry';
import { Button } from '@ui/primitives/button';
import { useGalleryViews } from '@web-hooks/ui/use-gallery-views';
import { Play, Sparkles } from 'lucide-react';
import Link from 'next/link';

/**
 * The image or video an operator featured at the top of the community page,
 * with who made it, the model behind it, and two ways in: watch more from the
 * creator on their profile, or recreate it in Genfeed with the same model.
 */
export default function CommunityFeaturedHero({
  featured,
  modelCredits = {},
}: CommunityFeaturedHeroProps): React.ReactElement {
  const { handle, kind, media } = featured;
  const modelKey = mediaModelKey(media);
  const modelLabel = modelKey ? modelCredits[modelKey] : undefined;
  const isVideo = kind === 'video';
  // The featured item counts a view like any gallery card.
  const { observe } = useGalleryViews();

  return (
    <section
      aria-labelledby="community-featured"
      className="grid gap-6 border border-foreground/10 bg-foreground/5 p-4 md:grid-cols-2 md:items-center md:p-6"
    >
      <div className="min-w-0" data-gallery-id={media.id} ref={observe}>
        {isVideo ? (
          <LazyMasonryVideo
            video={media as IVideo}
            isActionsEnabled={false}
            isPublicGallery={true}
            isPublicProfile={true}
          />
        ) : (
          <LazyMasonryImage
            image={media as IImage}
            isActionsEnabled={false}
            isPublicGallery={true}
            isPublicProfile={true}
          />
        )}
      </div>
      <div className="space-y-4">
        <p className="text-sm font-medium uppercase tracking-widest text-foreground/50">
          Featured {kind}
        </p>
        <h2
          className="text-2xl font-semibold tracking-tight text-foreground"
          id="community-featured"
        >
          Made by{' '}
          <Link
            className="hover:text-primary"
            href={creatorProfilePath(handle)}
          >
            @{handle}
          </Link>
        </h2>
        {modelKey && modelLabel ? (
          <p className="text-sm text-foreground/70">
            Generated with{' '}
            <Link
              className="font-medium text-foreground hover:text-primary"
              href={modelCatalogHref(modelKey)}
            >
              {modelLabel}
            </Link>
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button
            asChild
            size={ButtonSize.PUBLIC}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
          >
            <Link href={creatorTabPath(handle, isVideo ? 'videos' : 'images')}>
              {isVideo ? <Play aria-hidden="true" className="size-4" /> : null}
              {isVideo ? 'Watch' : 'View'}
            </Link>
          </Button>
          <Button asChild size={ButtonSize.PUBLIC} withWrapper={false}>
            <a
              href={buildRecreateHref(
                buildRecreatePrompt(kind, {
                  isFeatured: true,
                  modelLabel,
                  url: publicMediaUrl(media),
                }),
              )}
              onClick={() => trackRecreation(media.id)}
            >
              <Sparkles aria-hidden="true" className="size-4" />
              Recreate in Genfeed
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
