import { EnvironmentService } from '@services/core/environment.service';
import EditorialPoster from '@ui/marketing/EditorialPoster';
import PricingStrip from '@ui/marketing/PricingStrip';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import AgentFirstActions from '@web-components/buttons/agent-first-actions/AgentFirstActions';
import MarketingArtwork from '@web-components/content/MarketingArtwork';
import MarketingEntrance from '@web-components/MarketingEntrance';
import PageLayout from '@web-components/PageLayout';
import { Cpu, RefreshCw, Rocket, Sparkles, Users, Zap } from 'lucide-react';

const AGENT_ROLES = ['Research', 'Creative', 'Publishing', 'Approval'];

const FEATURES = [
  {
    description:
      'Hire specialized agents for research, creative, and publishing so every stage of content has an owner.',
    icon: Users,
    title: 'Specialized Agents',
  },
  {
    description:
      'Set goals and guardrails once, then let agents execute the work inside the boundaries you define.',
    icon: Cpu,
    title: 'Goals and Guardrails',
  },
  {
    description:
      'Agents research and draft each campaign on a schedule. Drafts wait for your approval unless you switch on auto-publish.',
    icon: Zap,
    title: 'Scheduled Campaigns',
  },
];

const STEPS = [
  {
    icon: Users,
    label: 'Hire',
    sublabel: 'Choose research, creative, and publishing agents',
  },
  {
    icon: Sparkles,
    label: 'Brief',
    sublabel: 'Set goals, guardrails, and brand direction',
  },
  {
    icon: RefreshCw,
    label: 'Draft',
    sublabel: 'Agents research and draft on schedule',
  },
  {
    icon: Rocket,
    label: 'Review',
    sublabel: 'Approve output before it goes live',
  },
];

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
        value: 'Hire -> brief -> draft -> review.',
      },
      {
        label: 'Outcome',
        value: 'Campaigns drafted on schedule, published when you approve.',
      },
    ]}
    subtitle="Agents draft, you approve"
    title="Your content team of agents."
  />
);

export default function HireAgentsContent() {
  const signUpHref = `${EnvironmentService.apps.app}/sign-up?plan=payg`;

  return (
    <MarketingEntrance>
      <PageLayout
        heroMedia={
          <MarketingArtwork page="/hire-agents" isCompact kind="workflow" />
        }
        heroActions={
          <AgentFirstActions
            signUpHref={signUpHref}
            signUpLabel="Create now"
            trackingName="hire_agents_hero_click"
          />
        }
        heroVisual={HERO_VISUAL}
        compact
        title="Hire Agents"
        description="A content team of agents that drafts on schedule and waits for your approval."
      >
        {/* Highlight Card */}
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <div className="gen-card-spotlight p-8">
            <div className="flex flex-col items-center gap-8 md:flex-row">
              <div className="flex-shrink-0">
                <div className="flex size-20 items-center justify-center bg-card shadow-border">
                  <Users className="size-10 text-surface" />
                </div>
              </div>
              <div className="flex w-full min-w-0 flex-col gap-3">
                <Heading as="h3" className="text-2xl font-bold">
                  A Content Team You Approve
                </Heading>
                <Text as="p" className="text-surface/65">
                  Hire agents for research, creative, and publishing. Set goals
                  and guardrails, then let them execute campaigns on schedule
                  while you stay in control of approvals.
                </Text>
              </div>
            </div>
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
                <Text className="text-center text-sm font-semibold tracking-[-0.01em] text-surface/70">
                  {role}
                </Text>
              </div>
            ))}
          </div>
        </section>

        {/* Features Grid */}
        <section className="gsap-section max-w-6xl mx-auto pb-16 px-6">
          <Heading as="h3" className="text-2xl font-bold text-center mb-8">
            Built for Scheduled Work
          </Heading>
          <div className="gsap-grid grid grid-cols-1 gap-1.5 md:grid-cols-2">
            {FEATURES.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className={`gsap-card gen-card-spotlight p-8 ${
                    index === 0 ? 'md:col-span-2' : ''
                  }`}
                >
                  <div className="mb-4 flex">
                    <div className="size-12 flex items-center justify-center border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)]">
                      <Icon className="size-6 text-[color:hsl(var(--gen-accent))]" />
                    </div>
                  </div>
                  <Heading as="h4" className="font-semibold mb-2 text-surface">
                    {feature.title}
                  </Heading>
                  <Text className="text-sm text-surface/65">
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
          <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
            {STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.label}
                  className="gen-contact-sheet flex flex-col items-center gap-3 bg-fill/[0.02] p-6 text-center"
                >
                  <div className="flex size-14 items-center justify-center border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)]">
                    <Icon className="size-6 text-[color:hsl(var(--gen-accent))]" />
                  </div>
                  <Text as="p" className="text-lg font-bold text-surface">
                    {step.label}
                  </Text>
                </div>
              );
            })}
          </div>
        </section>

        {/* Pricing CTA */}
        <section className="max-w-4xl mx-auto pb-16 px-6">
          <div className="gen-card-spotlight p-6 sm:p-12 text-center">
            <div className="flex justify-center mb-4">
              <Users className="size-8 text-surface" />
            </div>
            <Heading as="h3" className="text-2xl font-bold mb-6 text-surface">
              Hire Your Content Team Today
            </Heading>
            <PricingStrip className="mb-6" />
            <div className="flex flex-row items-center flex-wrap gap-4 justify-center">
              <AgentFirstActions
                signUpHref={signUpHref}
                signUpLabel="Create now"
                trackingName="hire_agents_cta_click"
              />
            </div>
          </div>
        </section>
      </PageLayout>
    </MarketingEntrance>
  );
}
