'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { HStack, VStack } from '@ui/layout/stack';
import EditorialPoster from '@ui/marketing/EditorialPoster';
import PricingStrip from '@ui/marketing/PricingStrip';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import PageLayout from '@web-components/PageLayout';
import {
  HiArrowPath,
  HiBolt,
  HiCpuChip,
  HiRocketLaunch,
  HiSparkles,
  HiUserGroup,
} from 'react-icons/hi2';

const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL ||
  'https://calendly.com/vincent-genfeed/30min';

const AGENT_ROLES = ['Research', 'Creative', 'Publishing', 'Approval'];

const FEATURES = [
  {
    description:
      'Hire specialized agents for research, creative, and publishing so every stage of content has an owner.',
    icon: HiUserGroup,
    title: 'Specialized Agents',
  },
  {
    description:
      'Set goals and guardrails once, then let agents execute the work inside the boundaries you define.',
    icon: HiCpuChip,
    title: 'Goals and Guardrails',
  },
  {
    description:
      'Run full campaigns on autopilot while agents research, generate, and publish on schedule.',
    icon: HiBolt,
    title: 'Campaign Autopilot',
  },
];

const STEPS = [
  {
    icon: HiUserGroup,
    label: 'Hire',
    sublabel: 'Choose research, creative, and publishing agents',
  },
  {
    icon: HiSparkles,
    label: 'Brief',
    sublabel: 'Set goals, guardrails, and brand direction',
  },
  {
    icon: HiArrowPath,
    label: 'Autopilot',
    sublabel: 'Agents research, generate, and publish on schedule',
  },
  {
    icon: HiRocketLaunch,
    label: 'Review',
    sublabel: 'Approve output before it goes live',
  },
];

const HIGHLIGHT_TAGS = ['Research', 'Generate', 'Publish', 'Autopilot'];

const HERO_VISUAL = (
  <EditorialPoster
    detail="Research, creative, and publishing agents work from one brief and one schedule."
    eyebrow="Agent Roster"
    footer={<span>Agents run inside the guardrails you set</span>}
    items={[
      {
        label: 'Roles',
        value: 'Research, creative, publishing, and approval agents.',
      },
      {
        label: 'Control',
        value: 'Goals and guardrails you define before agents execute.',
      },
      {
        label: 'Workflow',
        value: 'Hire -> brief -> autopilot -> review.',
      },
      {
        label: 'Outcome',
        value: 'Campaigns that run themselves without losing oversight.',
      },
    ]}
    subtitle="Autonomous agents, human oversight"
    title={
      <>
        Your autonomous
        <br />
        content team,
        <br />
        on call.
      </>
    }
  />
);

export default function AgentsContent() {
  const containerRef = useMarketingEntrance();
  const signUpHref = `${EnvironmentService.apps.app}/sign-up?plan=payg`;

  return (
    <div ref={containerRef}>
      <PageLayout
        heroActions={
          <>
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingName="agents_hero_click"
              trackingData={{ action: 'create_now' }}
            >
              <a href={signUpHref} target="_blank" rel="noopener noreferrer">
                Create now
              </a>
            </ButtonTracked>
            <ButtonTracked
              asChild
              variant={ButtonVariant.OUTLINE}
              size={ButtonSize.PUBLIC}
              trackingName="agents_hero_click"
              trackingData={{ action: 'book_demo' }}
            >
              <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer">
                Book a Demo
              </a>
            </ButtonTracked>
          </>
        }
        heroVisual={HERO_VISUAL}
        compact
        title="Agents"
        description="Your autonomous content team, hired and briefed in minutes."
      >
        {/* Highlight Card */}
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <div className="p-8 border border-[var(--gen-accent-border)] bg-gradient-to-r from-[var(--gen-accent-bg)] to-transparent">
            <HStack className="flex-col md:flex-row items-center gap-8">
              <div className="flex-shrink-0">
                <div className="size-20 flex items-center justify-center bg-[hsl(var(--gen-accent))]">
                  <HiUserGroup className="size-10 text-inv-fg" />
                </div>
              </div>
              <VStack className="gap-3">
                <Heading as="h3" className="text-2xl font-bold">
                  A Content Team That Runs Itself
                </Heading>
                <Text as="p" className="text-surface/50">
                  Hire agents for research, creative, and publishing. Set goals
                  and guardrails, then let them execute campaigns on schedule
                  while you stay in control of approvals.
                </Text>
                <HStack className="flex-wrap gap-2">
                  {HIGHLIGHT_TAGS.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 text-xs border border-[var(--gen-accent-border)] text-[var(--gen-accent-text)]"
                    >
                      {tag}
                    </span>
                  ))}
                </HStack>
              </VStack>
            </HStack>
          </div>
        </section>

        {/* Agent Roster Showcase */}
        <section className="max-w-4xl mx-auto pb-16 px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
            {AGENT_ROLES.map((role) => (
              <div
                key={role}
                className="gen-contact-sheet aspect-square flex items-center justify-center p-6 bg-fill/[0.02]"
              >
                <Text className="text-sm font-semibold text-surface/70 uppercase tracking-wider text-center">
                  {role}
                </Text>
              </div>
            ))}
          </div>
        </section>

        {/* Features Grid */}
        <section className="gsap-section max-w-6xl mx-auto pb-16 px-6">
          <Heading as="h3" className="text-2xl font-bold text-center mb-8">
            Built for Autonomous Execution
          </Heading>
          <div className="gsap-grid grid grid-cols-1 md:grid-cols-3 gap-1.5">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="gsap-card gen-card-spotlight p-8 bg-fill/[0.02] text-center"
                >
                  <div className="flex justify-center mb-4">
                    <div className="size-12 flex items-center justify-center border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)]">
                      <Icon className="size-6 text-[color:hsl(var(--gen-accent))]" />
                    </div>
                  </div>
                  <Heading
                    as="h4"
                    className="font-semibold mb-2 text-surface/90"
                  >
                    {feature.title}
                  </Heading>
                  <Text className="text-sm text-surface/40">
                    {feature.description}
                  </Text>
                </div>
              );
            })}
          </div>
        </section>

        {/* How It Works */}
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <Heading as="h3" className="text-2xl font-bold text-center mb-12">
            How It Works
          </Heading>
          <div className="space-y-0">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.label}>
                  <HStack className="items-center gap-6 py-6">
                    <div className="flex-shrink-0 size-14 flex items-center justify-center border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)]">
                      <Icon className="size-6 text-[color:hsl(var(--gen-accent))]" />
                    </div>
                    <VStack className="gap-1">
                      <Text className="text-lg font-bold text-surface/90">
                        {step.label}
                      </Text>
                      <Text className="text-sm text-surface/40">
                        {step.sublabel}
                      </Text>
                    </VStack>
                  </HStack>
                  {index < STEPS.length - 1 && (
                    <div className="gen-divider-accent" />
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Pricing CTA */}
        <section className="max-w-4xl mx-auto pb-16 px-6">
          <div className="text-center p-12 bg-[hsl(var(--gen-accent))]">
            <div className="flex justify-center mb-4">
              <HiUserGroup className="size-8 text-inv-fg" />
            </div>
            <Heading as="h3" className="text-2xl font-bold mb-2 text-inv-fg">
              Hire Your Content Team Today
            </Heading>
            <Text as="p" className="text-inv-fg/60 mb-6 max-w-lg mx-auto">
              Autonomous agents that research, generate, and publish content on
              schedule. Set the guardrails, then let the team run.
            </Text>
            <PricingStrip inverted className="mb-6" />
            <HStack className="flex-wrap gap-4 justify-center">
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                className="bg-inv-fg text-[color:hsl(var(--gen-accent))] hover:bg-inv-fg/80 px-8 py-3 text-xs font-bold uppercase tracking-wider"
                trackingName="agents_cta_click"
                trackingData={{ action: 'create_now' }}
              >
                <a href={signUpHref} target="_blank" rel="noopener noreferrer">
                  Create now
                </a>
              </ButtonTracked>
              <ButtonTracked
                asChild
                variant={ButtonVariant.OUTLINE}
                size={ButtonSize.PUBLIC}
                className="border-inv-fg/20 text-inv-fg hover:bg-inv-fg/5 px-8 py-3 text-xs font-bold uppercase tracking-wider"
                trackingName="agents_cta_click"
                trackingData={{ action: 'book_demo' }}
              >
                <a
                  href={CALENDLY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Book a Demo
                </a>
              </ButtonTracked>
            </HStack>
          </div>
        </section>
      </PageLayout>
    </div>
  );
}
