'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import EditorialPoster from '@ui/marketing/EditorialPoster';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import PageLayout from '@web-components/PageLayout';
import { Check, Quote, ShieldCheck, X } from 'lucide-react';
import Link from 'next/link';

interface PathStep {
  description: string;
  step: string;
  title: string;
}

interface ScorecardDimension {
  description: string;
  title: string;
}

/**
 * The six-step path: interview and corpus are the expert's truth and taste;
 * profile, score, first system, and weekly digest are what Genfeed builds
 * from them. Numbered to match the "How It Works" pattern used across
 * `use-cases/[slug]` and `agent`.
 */
const PATH_STEPS: PathStep[] = [
  {
    description:
      'Answer a structured interview about who you serve, what you believe, and what makes you different. This is the source of truth Genfeed builds from — not a generic brief filled in once and forgotten.',
    step: '01',
    title: 'Positioning interview',
  },
  {
    description:
      'Feed in your talks, newsletters, posts, and call notes. Genfeed reads your own material as brand memory instead of guessing your voice from a form.',
    step: '02',
    title: 'Corpus intake',
  },
  {
    description:
      'Genfeed generates a harness — a structured voice and positioning profile built from your corpus and interview, not a template shared across every account.',
    step: '03',
    title: 'Voice profile',
  },
  {
    description:
      'The profile is scored against six positioning dimensions, so you see exactly what is strong and what is missing before a single post goes out.',
    step: '04',
    title: 'Positioning scorecard',
  },
  {
    description:
      'Review a first content plan generated from your interview and corpus. Nothing renders or schedules until you approve it.',
    step: '05',
    title: 'First content system',
  },
  {
    description:
      'Every week, see what won and what to record next — the call, talk, or post that will feed the corpus and sharpen the system.',
    step: '06',
    title: 'Weekly digest',
  },
];

/**
 * The positioning scorecard breaks the "score" step (04) into the six
 * dimensions the issue calls out explicitly.
 */
const SCORECARD_DIMENSIONS: ScorecardDimension[] = [
  {
    description:
      'Whether your point of view is specific enough to be memorable, not just correct.',
    title: 'Attractive character',
  },
  {
    description:
      'The moment that explains why you do this work — sourced from your own interview, not invented.',
    title: 'Origin story',
  },
  {
    description:
      'The single belief that, if your audience adopted it, would make everything else you say obvious.',
    title: 'Big Domino',
  },
  {
    description:
      'What has changed in your market that makes the old way of doing things obsolete.',
    title: 'New opportunity',
  },
  {
    description:
      'The proof — talks, clients, results, credentials — that backs up the claim before anyone asks for it.',
    title: 'Authority signals',
  },
  {
    description:
      'What you say that a generic expert in your category would not, and why it matters.',
    title: 'Differentiation',
  },
];

const HERO_VISUAL = (
  <EditorialPoster
    detail="You supply the truth and the taste — the interview, the corpus, the judgment call on what's worth saying. Genfeed supplies the system and the loop that turns it into content, every week."
    eyebrow="For experts, coaches, and founders"
    footer={<span>Reviewed and approved by you, every time</span>}
    items={[
      { label: 'You bring', value: 'Your interview, talks, and call notes' },
      { label: 'Genfeed builds', value: 'A scored positioning profile' },
      {
        label: 'You review',
        value: 'The first content plan, before anything runs',
      },
      {
        label: 'You get',
        value: 'A weekly digest of what won and what to record next',
      },
    ]}
    subtitle="Not another AI tool to operate"
    title="Your Brand OS, built from what you already know"
  />
);

export default function ExpertsContent() {
  const containerRef = useMarketingEntrance();
  const signUpHref = `${EnvironmentService.apps.app}/sign-up?accountType=EXPERT`;

  return (
    <div ref={containerRef}>
      <PageLayout
        compact
        description="Built for consultants, coaches, founders, and practitioners who know their business cold but never wanted to become an AI-tool operator. You bring the truth and the taste; Genfeed brings the system and the loop."
        heroActions={
          <>
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'build_brand_os' }}
              trackingName="experts_hero_click"
            >
              <a href={signUpHref} rel="noopener noreferrer" target="_blank">
                Build your Brand OS
              </a>
            </ButtonTracked>
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'self_host' }}
              trackingName="experts_hero_click"
              variant={ButtonVariant.SECONDARY}
            >
              <Link href="/self-hosted">Self-host Genfeed</Link>
            </ButtonTracked>
          </>
        }
        heroVisual={HERO_VISUAL}
        title="You supply the truth. Genfeed supplies the system."
      >
        {/* Six-step path */}
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <Heading as="h2" className="text-2xl font-bold mb-2 text-surface">
            The six-step path
          </Heading>
          <Text as="p" className="text-surface/65 mb-8">
            One workflow, from your first interview to a running weekly
            operation.
          </Text>
          <div className="gen-card-spotlight">
            {PATH_STEPS.map((item, index) => (
              <div
                key={item.step}
                className={`flex items-start gap-5 p-6 ${index > 0 ? 'border-t border-edge/5' : ''}`}
              >
                <div className="shrink-0 size-8 flex items-center justify-center bg-fill/10 text-sm font-bold text-surface/50">
                  {item.step}
                </div>
                <div>
                  <Heading as="h3" className="font-semibold mb-1 text-surface">
                    {item.title}
                  </Heading>
                  <Text className="text-sm text-surface/60">
                    {item.description}
                  </Text>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Positioning scorecard breakdown */}
        <section className="gsap-section max-w-6xl mx-auto pb-16 px-6">
          <Heading as="h2" className="text-2xl font-bold mb-2 text-surface">
            The positioning scorecard
          </Heading>
          <Text as="p" className="text-surface/65 mb-8">
            Step 04 scores your profile against six dimensions before Genfeed
            drafts anything.
          </Text>
          <div className="gsap-grid grid grid-cols-1 gap-1.5 md:grid-cols-3">
            {SCORECARD_DIMENSIONS.map((dimension) => (
              <div
                key={dimension.title}
                className="gsap-card gen-card-spotlight p-6"
              >
                <Heading as="h3" className="font-semibold mb-2 text-surface">
                  {dimension.title}
                </Heading>
                <Text className="text-sm text-surface/60">
                  {dimension.description}
                </Text>
              </div>
            ))}
          </div>
        </section>

        {/* Before / after — illustrative example, not a customer testimonial */}
        <section className="gsap-section max-w-6xl mx-auto pb-16 px-6">
          <Heading as="h2" className="text-2xl font-bold mb-2 text-surface">
            Grounded in your corpus, not a prompt
          </Heading>
          <Text as="p" className="text-surface/65 mb-2">
            An illustrative example — not a real customer post — of the
            difference between a prompt with no source and a post pulled from an
            expert&apos;s own material.
          </Text>
          <div className="grid grid-cols-1 gap-px bg-edge/5 md:grid-cols-2">
            <div className="bg-background p-8">
              <div className="mb-4 flex items-center gap-2">
                <X className="size-4 text-error" />
                <Text className="text-sm font-bold text-surface">
                  Generic AI post
                </Text>
              </div>
              <Text className="text-sm leading-6 text-surface/65">
                &ldquo;Consistency is everything. The best founders show up
                every day and share value with their audience.&rdquo;
              </Text>
            </div>
            <div className="bg-background p-8">
              <div className="mb-4 flex items-center gap-2">
                <Check className="size-4 text-success" />
                <Text className="text-sm font-bold text-surface">
                  Grounded in your corpus
                </Text>
              </div>
              <Text className="text-sm leading-6 text-surface/65">
                &ldquo;I used to think consistency meant posting daily. Then I
                watched three clients burn out chasing a schedule instead of a
                point of view. The founders who compound aren&apos;t the ones
                who post the most — they&apos;re the ones whose last ten posts
                you&apos;d recognize as theirs blindfolded.&rdquo;
              </Text>
              <div className="mt-4 flex items-center gap-2 border-t border-edge/10 pt-4">
                <Quote className="size-3.5 shrink-0 text-surface/45" />
                <Text className="text-xs font-medium text-surface/55">
                  Source: your 2024 keynote transcript
                </Text>
              </div>
            </div>
          </div>
        </section>

        {/* Approval gate — no autonomous publishing claim */}
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <div className="gen-card-spotlight p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex-shrink-0">
                <div className="flex size-12 items-center justify-center border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)]">
                  <ShieldCheck className="size-6 text-[color:hsl(var(--gen-accent))]" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Heading as="h2" className="text-xl font-bold text-surface">
                  Nothing publishes without your approval
                </Heading>
                <Text as="p" className="text-sm text-surface/65">
                  Publish approval is on by default for every expert account.
                  Genfeed drafts the positioning scorecard and the first content
                  system from your corpus and interview; you review and approve
                  before anything renders, schedules, or goes out. There is no
                  autonomous-publishing mode you have to opt out of — approval
                  is the starting state.
                </Text>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="max-w-4xl mx-auto pb-16 px-6">
          <div className="gen-card-spotlight p-12 text-center">
            <Heading as="h2" className="text-2xl font-bold mb-2 text-surface">
              Build your Brand OS
            </Heading>
            <Text as="p" className="text-surface/70 mb-6 max-w-lg mx-auto">
              Start with the positioning interview. Your corpus, your scorecard,
              and your first reviewable content plan follow from there.
            </Text>
            <div className="flex flex-row items-center flex-wrap gap-4 justify-center">
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                trackingData={{ action: 'build_brand_os' }}
                trackingName="experts_cta_click"
              >
                <a href={signUpHref} rel="noopener noreferrer" target="_blank">
                  Build your Brand OS
                </a>
              </ButtonTracked>
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                trackingData={{ action: 'self_host' }}
                trackingName="experts_cta_click"
                variant={ButtonVariant.SECONDARY}
              >
                <Link href="/self-hosted">Self-host Genfeed</Link>
              </ButtonTracked>
            </div>
          </div>
        </section>
      </PageLayout>
    </div>
  );
}
