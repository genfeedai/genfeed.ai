'use client';

import type { ExampleCampaign } from '@props/website/home.props';
import { HStack, VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';

const EYEBROW_CLASS =
  'text-xs font-bold uppercase tracking-widest text-surface/65';

// NOTE: placeholder example campaigns until real, attributable early-access
// customers can be featured. Swap the handles, captions, and metrics for
// genuine, permissioned examples before treating this as social proof.
// The "Illustrative example" badge below is REQUIRED while this data is
// fabricated — do not remove it without replacing the underlying data with
// real, permissioned customer campaigns.
const EXAMPLE_CAMPAIGNS: ExampleCampaign[] = [
  {
    caption:
      'Tokyo midnight drop for a travel client. Approved, captioned, and scheduled before breakfast.',
    handle: 'kai.travels',
    likes: '21,503',
    status: 'Client approved',
  },
  {
    caption:
      'Fashion creator pack generated from one brief with brand-safe styling locked in.',
    handle: 'nova.styles',
    likes: '18,240',
    status: 'Ready to publish',
  },
  {
    caption:
      'Beauty vertical for a client launch. Hooks, variants, and KPI tracking already queued.',
    handle: 'aria.digital',
    likes: '27,991',
    status: 'Tracking live',
  },
];

export default function HomeProof(): React.ReactElement {
  return (
    <section
      id="work"
      className="gen-section-spacing-lg border-b border-edge/5"
    >
      <div className="container mx-auto px-6">
        <VStack className="mb-10 max-w-3xl gap-4">
          <Text className={EYEBROW_CLASS}>The workflow</Text>
          <Heading
            as="h2"
            className="text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl"
          >
            Brand-safe, approved, tracked.
          </Heading>
          <Text className="max-w-2xl text-base leading-7 gen-text-muted">
            Illustrative examples of what Genfeed can produce, from brief to
            client-approved, with performance tracking already queued.
          </Text>
        </VStack>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {EXAMPLE_CAMPAIGNS.map((campaign) => (
            <div
              key={campaign.handle}
              className="gen-card-spotlight flex flex-col gap-4 p-5"
            >
              <HStack className="items-center justify-between">
                <HStack className="items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-full bg-white/[0.08] text-sm font-bold text-surface">
                    {campaign.handle.charAt(0).toUpperCase()}
                  </div>
                  <VStack className="gap-0">
                    <Text className="text-sm font-semibold text-surface">
                      {campaign.handle}
                    </Text>
                    <Text className="text-[11px] leading-4 text-surface/55">
                      Instagram
                    </Text>
                  </VStack>
                </HStack>
                <HStack className="items-center gap-1.5 rounded-full bg-surface/10 px-2.5 py-1">
                  <span className="size-1.5 rounded-full bg-surface/50" />
                  <Text className="text-[11px] font-medium text-surface/70">
                    {campaign.status}
                  </Text>
                </HStack>
              </HStack>

              <HStack className="items-center gap-1.5 self-start rounded-full bg-warning/10 px-2.5 py-1">
                <Text className="text-[10px] font-semibold uppercase tracking-wider text-warning">
                  Illustrative example
                </Text>
              </HStack>

              <Text className="text-sm leading-6 text-surface/72">
                {campaign.caption}
              </Text>

              <HStack className="items-center gap-2 border-t border-edge/5 pt-3 text-xs text-surface/55">
                <Text className="font-semibold text-surface/72">
                  {campaign.likes}
                </Text>
                <Text>likes</Text>
                <Text className="text-surface/25">·</Text>
                <Text>#AIContent #Genfeed</Text>
              </HStack>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
