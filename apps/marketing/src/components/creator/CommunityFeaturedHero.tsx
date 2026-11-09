'use client';

import { modelCatalogHref } from '@data/model-credits';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  creatorProfilePath,
  creatorTabPath,
} from '@genfeedai/contracts/constants';
import type { IImage, IVideo } from '@genfeedai/contracts/interfaces';
import { buildAgentPromptHref } from '@genfeedai/utils/url/desktop-loop-url.util';
import type { CommunityFeaturedHeroProps } from '@props/content/creator.props';
import { EnvironmentService } from '@services/core/environment.service';
import {
  LazyMasonryImage,
  LazyMasonryVideo,
} from '@ui/lazy/masonry/LazyMasonry';
import { Button } from '@ui/primitives/button';
import { Play, Sparkles } from 'lucide-react';
import Link from 'next/link';

/** The agent prompt behind "Recreate in Genfeed": same kind, same model. */
export function buildFeaturedPrompt(
  kind: 'image' | 'video',
  modelLabel?: string,
): string {
  const model = modelLabel ? ` with ${modelLabel}` : '';
  return `Make a ${kind} like the one featured on genfeed.ai/community${model}`;
}

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
  const modelLabel = media.model ? modelCredits[media.model] : undefined;
  const isVideo = kind === 'video';

  return (
    <section
      aria-labelledby="community-featured"
      className="grid gap-6 border border-foreground/10 bg-foreground/5 p-4 md:grid-cols-2 md:items-center md:p-6"
    >
      <div className="min-w-0">
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
        {media.model && modelLabel ? (
          <p className="text-sm text-foreground/70">
            Generated with{' '}
            <Link
              className="font-medium text-foreground hover:text-primary"
              href={modelCatalogHref(media.model)}
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
              href={`${EnvironmentService.apps.app}${buildAgentPromptHref(
                buildFeaturedPrompt(kind, modelLabel),
              )}`}
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
