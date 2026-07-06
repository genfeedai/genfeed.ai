'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import { EnvironmentService } from '@services/core/environment.service';
import SectionHeader from '@ui/marketing/SectionHeader';
import { Button } from '@ui/primitives/button';
import FaqGrid from '@web-components/content/FaqGrid';
import {
  CtaSection,
  NeuralGrid,
  NeuralGridItem,
  WebSection,
} from '@web-components/content/NeuralGrid';
import PageLayout from '@web-components/PageLayout';
import {
  LuCloud,
  LuCpu,
  LuGitBranch,
  LuServer,
  LuShieldCheck,
  LuTerminal,
} from 'react-icons/lu';

const DOCS_URL = 'https://docs.genfeed.ai';

const WHY_SELF_HOST = [
  {
    description:
      'Deploy the full content OS on your own servers with Docker. Your models, your storage, your network — no vendor lock-in.',
    icon: LuServer,
    title: 'Own Your Infrastructure',
  },
  {
    description:
      'Everything runs inside your environment. Nothing leaves your infrastructure unless you decide it does.',
    icon: LuShieldCheck,
    title: 'Own Your Data',
  },
  {
    description:
      'Bring your own keys or run open-source models locally. Route generation however you want, with no per-credit meter.',
    icon: LuCpu,
    title: 'Run Your Own Models',
  },
] as const;

const QUICKSTART = [
  {
    description: 'Clone the AGPL-licensed monorepo from GitHub.',
    step: 'Clone',
  },
  {
    description:
      'Copy the example env, add your keys, and pick your models and storage.',
    step: 'Configure',
  },
  {
    description: 'Bring it up with Docker Compose — API, workers, and app.',
    step: 'Deploy',
  },
  {
    description: 'Connect your channels and start publishing.',
    step: 'Connect',
  },
] as const;

const FAQ_ITEMS = [
  {
    answer:
      'Yes. The core is open source under AGPL-3.0. Clone it, run it on your own infrastructure, and use it for free — you cover your own hosting and model costs.',
    question: 'Is self-hosting really free?',
  },
  {
    answer:
      'The repository is licensed AGPL-3.0. Enterprise features under ee/ carry a separate commercial license. Self-hosting the core for your own use is fully covered by the open-source license.',
    question: 'What is the license?',
  },
  {
    answer:
      'Self-host gives you full control and zero platform fees, but you run the infrastructure, updates, and models yourself. Managed cloud handles all of that, adds managed credits and support, and starts free — most teams self-host to evaluate, then move to cloud to skip the ops.',
    question: 'Self-host or managed cloud?',
  },
  {
    answer:
      'Community support lives on GitHub — issues, discussions, and the docs. Managed cloud plans add direct support and SLAs.',
    question: 'Do I get support?',
  },
  {
    answer:
      'Anytime. Start self-hosted, then move to managed cloud whenever the operational overhead outweighs the control — your workflows and content model carry over.',
    question: 'Can I move to cloud later?',
  },
];

export default function SelfHostedContent() {
  const containerRef = useMarketingEntrance({ hero: false, sections: false });
  const repoHref = EnvironmentService.github.core;
  const cloudSignUpHref = `${EnvironmentService.apps.app}/sign-up?plan=payg`;

  return (
    <div ref={containerRef}>
      <PageLayout
        badge="Open Source"
        badgeIcon={LuGitBranch}
        title={
          <>
            Open source. Self-host on{' '}
            <span className="italic font-light">your own infra</span>.
          </>
        }
        description="The full Genfeed content OS is open source. Clone it, run it with Docker, and own your stack end to end — or skip the ops and start free on managed cloud."
      >
        <WebSection maxWidth="lg" py="md">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button
              asChild
              size={ButtonSize.PUBLIC}
              variant={ButtonVariant.WHITE}
            >
              <a href={repoHref} target="_blank" rel="noopener noreferrer">
                View on GitHub
              </a>
            </Button>
            <Button
              asChild
              size={ButtonSize.PUBLIC}
              variant={ButtonVariant.OUTLINE}
            >
              <a
                href={cloudSignUpHref}
                target="_blank"
                rel="noopener noreferrer"
              >
                Start free on cloud
              </a>
            </Button>
          </div>
        </WebSection>

        <WebSection maxWidth="xl" className="gsap-section">
          <SectionHeader
            title="Why self-host"
            description="Full control over your infrastructure, data, and models — with no platform fees and no lock-in."
            className="[&_h2]:text-5xl"
          />

          <NeuralGrid columns={3} className="gsap-grid">
            {WHY_SELF_HOST.map((item) => (
              <NeuralGridItem
                key={item.title}
                icon={item.icon}
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
            title="Up and running in four steps"
            description="A standard Docker deployment. Full instructions live in the docs."
            className="[&_h2]:text-5xl"
          />

          <NeuralGrid columns={4}>
            {QUICKSTART.map((item, index) => (
              <NeuralGridItem
                key={item.step}
                tierLabel={`0${index + 1} / ${item.step}`}
                padding="lg"
                className={cn(index === 0 && 'bg-fill/[0.02]')}
              >
                <p className="text-sm leading-relaxed text-surface/60">
                  {item.description}
                </p>
              </NeuralGridItem>
            ))}
          </NeuralGrid>

          <div className="mt-8 flex justify-center">
            <Button
              asChild
              size={ButtonSize.PUBLIC}
              variant={ButtonVariant.OUTLINE}
            >
              <a href={DOCS_URL} target="_blank" rel="noopener noreferrer">
                Read the self-hosting docs
              </a>
            </Button>
          </div>
        </WebSection>

        <WebSection maxWidth="lg" className="gsap-section">
          <SectionHeader
            title="Self-host or managed cloud"
            description="Same product. Self-host for control; move to cloud when you would rather not run the infrastructure."
            className="[&_h2]:text-5xl"
          />

          <NeuralGrid columns={2}>
            <NeuralGridItem
              icon={LuTerminal}
              title="Self-host"
              tierLabel="Free / open source"
              padding="lg"
            >
              <ul className="space-y-3">
                {[
                  'Run it on your own infrastructure',
                  'Full control of data and models',
                  'No platform fees, no credit meter',
                  'You handle hosting, updates, and support',
                  'Community support on GitHub',
                ].map((item) => (
                  <li
                    key={item}
                    className="border-b border-edge/5 pb-3 text-sm text-surface/60 last:border-b-0 last:pb-0"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </NeuralGridItem>

            <NeuralGridItem
              icon={LuCloud}
              title="Managed cloud"
              tierLabel="Free to start"
              padding="lg"
              className="bg-white/[0.03]"
            >
              <ul className="space-y-3">
                {[
                  'We run the infrastructure and updates',
                  'Managed credits — pay only for output',
                  'No ops, no scaling to manage',
                  'Direct support and SLAs on paid plans',
                  'Start free on Pay As You Go',
                ].map((item) => (
                  <li
                    key={item}
                    className="border-b border-edge/5 pb-3 text-sm text-surface/60 last:border-b-0 last:pb-0"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </NeuralGridItem>
          </NeuralGrid>
        </WebSection>

        <WebSection bg="bordered" maxWidth="md" className="gsap-section">
          <SectionHeader
            title="Common Questions"
            description="Open source for control, managed cloud for convenience."
            className="[&_h2]:text-5xl"
          />

          <FaqGrid items={FAQ_ITEMS} />
        </WebSection>

        <CtaSection
          bg="subtle"
          title="Ship it your way."
          description="Start free on managed cloud, or deploy the open-source core on your own infrastructure."
        >
          <Button size={ButtonSize.PUBLIC} asChild>
            <a href={cloudSignUpHref} target="_blank" rel="noopener noreferrer">
              Start free on cloud
            </a>
          </Button>
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.PUBLIC}
            asChild
          >
            <a href={repoHref} target="_blank" rel="noopener noreferrer">
              View on GitHub
            </a>
          </Button>
        </CtaSection>
      </PageLayout>
    </div>
  );
}
