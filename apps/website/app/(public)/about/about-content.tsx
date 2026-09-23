'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { PLAN_COPY } from '@genfeedai/pricing';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import { EnvironmentService } from '@services/core/environment.service';
import SectionHeader from '@ui/marketing/SectionHeader';
import { Button } from '@ui/primitives/button';
import {
  DefinitionDetail,
  DefinitionList,
  DefinitionTerm,
} from '@ui/primitives/definition-list';
import FaqGrid from '@web-components/content/FaqGrid';
import {
  CtaSection,
  NeuralGrid,
  NeuralGridItem,
  WebSection,
} from '@web-components/content/NeuralGrid';
import PageLayout from '@web-components/PageLayout';
import Link from 'next/link';
import type { ComponentProps } from 'react';

const FOUNDER = {
  github: 'https://github.com/VincentShipsIt',
  linkedin: 'https://www.linkedin.com/in/vincentshipsit',
  name: 'Vincent Tellier',
  x: 'https://x.com/VincentShipsIt',
} as const;

const CONTACT_EMAIL = 'hello@genfeed.ai';
const FOUNDED_YEAR = '2026';

const LINK_CLASS =
  'text-surface underline underline-offset-4 hover:text-surface/80';

function ExternalLink(props: ComponentProps<'a'>) {
  return (
    <a
      {...props}
      target="_blank"
      rel="noopener noreferrer"
      className={LINK_CLASS}
    />
  );
}

function InternalLink(props: ComponentProps<typeof Link>) {
  return <Link {...props} className={LINK_CLASS} />;
}

const SERVICES = [
  {
    description:
      'Generate video, images, voiceovers, and articles from one brief. The Genfeed router sends each job to the best model for the format, so you never pick from a model menu, and every job shows its credit price before it runs.',
    title: 'Create',
  },
  {
    description:
      'Schedule and publish to YouTube, TikTok, Instagram, X, LinkedIn, and more from the same workspace. Brands and connected channels are unlimited on every plan.',
    title: 'Publish',
  },
  {
    description:
      'Workflows and agents turn recurring content into a pipeline: a trigger, generation steps, review, and publishing. A daily posting cadence keeps running without doing each post by hand.',
    title: 'Automate',
  },
  {
    description:
      'Analytics show how each post performs across your channels. The next brief starts from what worked instead of guesswork.',
    title: 'Measure',
  },
  {
    description:
      'Every paid plan includes API access at the same credit price. The MCP server lets AI agents such as Claude and ChatGPT run Genfeed directly.',
    title: 'Build on it',
  },
] as const;

const DIFFERENTIATORS = [
  {
    body: (
      <>
        The whole codebase, billing included, is public on{' '}
        <ExternalLink href={EnvironmentService.github.core}>
          GitHub
        </ExternalLink>{' '}
        under AGPL-3.0, and you can self-host it with Docker. Buffer, Jasper,
        and Runway are closed-source services you can only rent.
      </>
    ),
    title: 'Open source, including billing',
  },
  {
    body: (
      <>
        <InternalLink href="/vs/buffer">Buffer</InternalLink> schedules posts
        but does not generate video, images, or voice.{' '}
        <InternalLink href="/vs/runway">Runway</InternalLink> generates video
        but does not publish it to your channels. Genfeed does both in one
        workspace.
      </>
    ),
    title: 'Creation and publishing in one tool',
  },
  {
    body: (
      <>
        Paid plans include unlimited seats, and every plan includes unlimited
        brands and connected channels. Buffer charges per connected channel and{' '}
        <InternalLink href="/vs/jasper">Jasper</InternalLink> charges per seat,
        so their cost grows with your team.
      </>
    ),
    title: 'No per-seat or per-channel pricing',
  },
  {
    body: (
      <>
        One credit is one cent. An image costs 50 credits ($0.50) and an
        8-second reel costs 600 credits ($6.00), and you see the price before
        you generate.
      </>
    ),
    title: 'Published prices per output',
  },
  {
    body: (
      <>
        {PLAN_COPY.payg.name} is free to join: top up from $10 and pay only for
        what you generate. Subscriptions are month to month, and{' '}
        {PLAN_COPY.pro.nameWithPrice} includes {PLAN_COPY.pro.includedCredits}{' '}
        at a {PLAN_COPY.pro.creditRateAdvantage} better rate.
      </>
    ),
    title: 'No subscription required',
  },
] as const;

const AUDIENCES = [
  'Developer-founders and 1–10 person product teams who ship often but have no one on marketing.',
  'Solo creators and AI-influencer operators who post daily across several platforms.',
  `Marketing agencies producing content for several client brands, with a separate organization per client on ${PLAN_COPY.scale.name}.`,
  'Teams that need to run their content tooling on their own infrastructure.',
] as const;

const HOW_IT_WORKS = [
  {
    description: `Sign up free, connect your channels, and set up a brand with its voice and visuals. No sales call is needed; ${PLAN_COPY.enterprise.name} rollouts start with a demo.`,
    title: 'Onboarding',
  },
  {
    description:
      'Images take 10–30 seconds, voiceovers about 30 seconds, articles 1–2 minutes, and videos 2–5 minutes.',
    title: 'Turnaround',
  },
  {
    description:
      'The founder. Support email, GitHub issues, and DMs reach Vincent directly, not a ticket queue.',
    title: 'Who you work with',
  },
  {
    description: `Email support on ${PLAN_COPY.pro.name}, priority support on ${PLAN_COPY.scale.name}, and a dedicated Slack channel with SLA terms on ${PLAN_COPY.enterprise.name}. Self-hosted users get community support on GitHub and Discord.`,
    title: 'Support channels',
  },
] as const;

const KEY_FACTS = [
  { label: 'Company name', value: 'Genfeed' },
  {
    label: 'Type',
    value:
      'Open-source AI content platform, available as managed cloud SaaS or self-hosted',
  },
  { label: 'Founded', value: FOUNDED_YEAR },
  {
    label: 'Founder',
    value: <ExternalLink href={FOUNDER.x}>{FOUNDER.name}</ExternalLink>,
  },
  { label: 'Headquarters', value: 'Fully remote' },
  {
    label: 'Website',
    value: <ExternalLink href="https://genfeed.ai">genfeed.ai</ExternalLink>,
  },
  {
    label: 'Core offering',
    value:
      'AI generation of video, images, voice, and articles, plus multi-platform publishing, workflows, and analytics',
  },
  {
    label: 'Pricing',
    value: `${PLAN_COPY.payg.nameWithPrice}, ${PLAN_COPY.pro.nameWithPrice}, ${PLAN_COPY.scale.nameWithPrice}, ${PLAN_COPY.enterprise.nameWithPrice}. One credit costs $0.01.`,
  },
  {
    label: 'Contract terms',
    value: `Month to month. ${PLAN_COPY.payg.name} has no subscription.`,
  },
  {
    label: 'License',
    value: (
      <ExternalLink href={EnvironmentService.github.core}>
        AGPL-3.0
      </ExternalLink>
    ),
  },
  {
    label: 'Products',
    value: 'Studio, Publishing, Workflows, Agents, Analytics, API, MCP server',
  },
  {
    label: 'Communication',
    value: (
      <>
        <a href={`mailto:${CONTACT_EMAIL}`} className={LINK_CLASS}>
          {CONTACT_EMAIL}
        </a>
        , GitHub issues, Discord, and Slack on {PLAN_COPY.enterprise.name}
      </>
    ),
  },
  {
    label: 'Competitors',
    value: (
      <>
        Buffer, Jasper, Runway, Opus Clip, Canva (
        <InternalLink href="/vs">see comparisons</InternalLink>)
      </>
    ),
  },
  {
    label: 'Social',
    value: (
      <>
        <ExternalLink href={EnvironmentService.social.twitter}>X</ExternalLink>,{' '}
        <ExternalLink href={EnvironmentService.social.linkedin}>
          LinkedIn
        </ExternalLink>
        ,{' '}
        <ExternalLink href={EnvironmentService.github.org}>GitHub</ExternalLink>
        ,{' '}
        <ExternalLink href={EnvironmentService.social.youtube}>
          YouTube
        </ExternalLink>
        ,{' '}
        <ExternalLink href={EnvironmentService.social.instagram}>
          Instagram
        </ExternalLink>
        ,{' '}
        <ExternalLink href={EnvironmentService.social.tiktok}>
          TikTok
        </ExternalLink>
      </>
    ),
  },
] as const;

const FAQ_ITEMS = [
  {
    answer: `Genfeed is founded and run by ${FOUNDER.name} as a solo founder. The company started in ${FOUNDED_YEAR} and works fully remote.`,
    question: 'Who is behind Genfeed?',
  },
  {
    answer:
      'Yes. The full repository, billing included, is licensed AGPL-3.0 on GitHub. You can self-host it with Docker or use the managed cloud at genfeed.ai.',
    question: 'Is Genfeed really open source?',
  },
  {
    answer: `${PLAN_COPY.payg.name} is free to join and you pay per output, at one cent per credit. ${PLAN_COPY.pro.name} is ${PLAN_COPY.pro.monthlyPrice}, ${PLAN_COPY.scale.name} is ${PLAN_COPY.scale.monthlyPrice}, and ${PLAN_COPY.enterprise.name} is custom.`,
    question: 'How much does Genfeed cost?',
  },
  {
    answer:
      'No. You own the rights to what you generate, and your content is never used for training or shared with third parties.',
    question: 'Does Genfeed train AI on my content?',
  },
  {
    answer: `Email ${CONTACT_EMAIL} or message @VincentShipsIt on X. Both reach the founder directly.`,
    question: 'How do I reach the founder?',
  },
] as const;

export default function AboutContent() {
  const containerRef = useMarketingEntrance({ hero: false, sections: false });
  const signUpHref = `${EnvironmentService.apps.app}/sign-up?plan=payg`;

  return (
    <div ref={containerRef}>
      <PageLayout
        title="About Genfeed"
        description="Genfeed is an open-source AI content platform that generates, publishes, and measures video, image, voice, and written content for creators, agencies, and founders."
      >
        <WebSection maxWidth="xl" className="gsap-section">
          <SectionHeader
            title="What Genfeed does"
            description="One workspace for making content, posting it, and learning what works."
            className="[&_h2]:text-5xl"
          />

          <NeuralGrid columns={3} className="gsap-grid">
            {SERVICES.map((item) => (
              <NeuralGridItem
                key={item.title}
                title={item.title}
                description={item.description}
                className="gsap-card"
                padding="lg"
              />
            ))}
          </NeuralGrid>
        </WebSection>

        <WebSection bg="bordered" maxWidth="xl" className="gsap-section">
          <SectionHeader
            title="What makes Genfeed different"
            className="[&_h2]:text-5xl"
          />

          <NeuralGrid columns={2}>
            {DIFFERENTIATORS.map((item) => (
              <NeuralGridItem key={item.title} title={item.title} padding="lg">
                <p className="text-sm leading-relaxed text-surface/65">
                  {item.body}
                </p>
              </NeuralGridItem>
            ))}
          </NeuralGrid>
        </WebSection>

        <WebSection maxWidth="md" className="gsap-section">
          <SectionHeader title="Who uses Genfeed" className="[&_h2]:text-5xl" />

          <ul className="space-y-3">
            {AUDIENCES.map((item) => (
              <li
                key={item}
                className="border-b border-edge/5 pb-3 text-surface/65 last:border-b-0 last:pb-0"
              >
                {item}
              </li>
            ))}
          </ul>
        </WebSection>

        <WebSection bg="bordered" maxWidth="lg" className="gsap-section">
          <SectionHeader
            title="The team behind Genfeed"
            className="[&_h2]:text-5xl"
          />

          <NeuralGrid columns={2}>
            <NeuralGridItem
              title={`${FOUNDER.name}, founder`}
              tierLabel="@VincentShipsIt"
              padding="lg"
            >
              <p className="text-sm leading-relaxed text-surface/65">
                Genfeed is a one-person company. {FOUNDER.name} founded it in{' '}
                {FOUNDED_YEAR} and builds it remotely and in public, working
                with AI agents across code and content.
              </p>
              <p className="mt-4 text-sm text-surface/65">
                <ExternalLink href={FOUNDER.x}>X</ExternalLink> ·{' '}
                <ExternalLink href={FOUNDER.linkedin}>LinkedIn</ExternalLink> ·{' '}
                <ExternalLink href={FOUNDER.github}>GitHub</ExternalLink>
              </p>
            </NeuralGridItem>

            <NeuralGridItem title="Why Genfeed exists" padding="lg">
              <p className="text-sm leading-relaxed text-surface/65">
                Genfeed started from a builder&apos;s problem: shipping products
                nobody sees, because every hour spent making content is an hour
                taken from the product. Genfeed is used to market Genfeed,
                starting with the founder&apos;s own posts.
              </p>
            </NeuralGridItem>
          </NeuralGrid>
        </WebSection>

        <WebSection maxWidth="xl" className="gsap-section">
          <SectionHeader
            title="How Genfeed works"
            className="[&_h2]:text-5xl"
          />

          <NeuralGrid columns={4}>
            {HOW_IT_WORKS.map((item) => (
              <NeuralGridItem
                key={item.title}
                title={item.title}
                description={item.description}
                padding="lg"
              />
            ))}
          </NeuralGrid>
        </WebSection>

        <WebSection bg="bordered" maxWidth="md" className="gsap-section">
          <SectionHeader title="Key facts" className="[&_h2]:text-5xl" />

          <DefinitionList className="space-y-0 divide-y divide-edge/5 border-y border-edge/5">
            {KEY_FACTS.map((fact) => (
              <div
                key={fact.label}
                className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr] sm:gap-6"
              >
                <DefinitionTerm className="font-semibold text-surface">
                  {fact.label}
                </DefinitionTerm>
                <DefinitionDetail className="leading-relaxed text-surface/65">
                  {fact.value}
                </DefinitionDetail>
              </div>
            ))}
          </DefinitionList>
        </WebSection>

        <WebSection maxWidth="md" className="gsap-section">
          <SectionHeader
            title="Frequently asked questions"
            className="[&_h2]:text-5xl"
          />

          <FaqGrid items={[...FAQ_ITEMS]} />
        </WebSection>

        <CtaSection
          bg="subtle"
          title="Start free on Genfeed."
          description={`Sign up on ${PLAN_COPY.payg.name} and pay only for what you generate.`}
        >
          <Button size={ButtonSize.PUBLIC} asChild>
            <a href={signUpHref} target="_blank" rel="noopener noreferrer">
              Start free
            </a>
          </Button>
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.PUBLIC}
            asChild
          >
            <Link href="/pricing">See pricing</Link>
          </Button>
        </CtaSection>
      </PageLayout>
    </div>
  );
}
