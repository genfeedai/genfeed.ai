import { getMarketingOgImage } from '@data/marketing-og.data';
import { X_PLAYER_CARD_ORIGIN } from '@data/x-player-card';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { metadata as site } from '@helpers/media/metadata/metadata.helper';
import { Button } from '@ui/primitives/button';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { HOME_SOCIAL_VIDEO } from '@web-components/home/_assets';

export default function XPlayerCardContent() {
  return (
    <main className="relative h-dvh overflow-hidden bg-background text-foreground">
      <video
        autoPlay
        className="absolute inset-0 h-full w-full object-cover"
        loop
        muted
        playsInline
        poster={getMarketingOgImage('/', site.name).url}
        preload="metadata"
      >
        <source src={HOME_SOCIAL_VIDEO.url} type="video/mp4" />
        <track kind="captions" />
      </video>
      <div className="absolute inset-0 bg-background/70" />
      <div className="relative flex h-[70dvh] flex-col justify-between px-6 py-6 sm:h-full sm:px-8 sm:py-8">
        <div className="flex min-h-0 flex-col gap-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/60">
            {site.name}
          </p>
          <Heading
            as="h1"
            className="max-w-[12ch] text-balance text-[1.75rem] leading-[0.98] tracking-[-0.02em] text-foreground sm:text-[2.125rem]"
            size="3xl"
          >
            From brief to feed.
          </Heading>
          <Text
            as="p"
            className="max-w-[38ch] text-sm leading-6 text-foreground/80"
          >
            {site.description}
          </Text>
        </div>
        <Button
          asChild
          className="w-full justify-center"
          size={ButtonSize.PUBLIC}
          variant={ButtonVariant.DEFAULT}
        >
          <a
            href={X_PLAYER_CARD_ORIGIN}
            rel="noopener noreferrer"
            target="_blank"
          >
            Open Genfeed
          </a>
        </Button>
      </div>
    </main>
  );
}
