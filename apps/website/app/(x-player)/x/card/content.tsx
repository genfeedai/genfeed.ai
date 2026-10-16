import { X_PLAYER_CARD_ORIGIN } from '@data/x-player-card';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { metadata as site } from '@helpers/media/metadata/metadata.helper';
import { Button } from '@ui/primitives/button';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';

export default function XPlayerCardContent() {
  return (
    <main className="h-dvh overflow-hidden bg-background text-surface">
      <div className="flex h-[70dvh] flex-col justify-between px-6 py-6 sm:h-full sm:px-8 sm:py-8">
        <div className="flex min-h-0 flex-col gap-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-surface/60">
            {site.name}
          </p>
          <Heading
            as="h1"
            className="max-w-[12ch] text-balance text-[1.75rem] leading-[0.98] tracking-[-0.045em] text-surface sm:text-[2.125rem]"
            size="3xl"
          >
            Ask once. Show up everywhere.
          </Heading>
          <Text
            as="p"
            className="max-w-[38ch] text-sm leading-6 text-surface/72"
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
