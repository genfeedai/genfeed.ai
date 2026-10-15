import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { EnvironmentService } from '@services/core/environment.service';
import SectionHeader from '@ui/marketing/SectionHeader';
import { Button } from '@ui/primitives/button';
import FaqGrid from '@web-components/content/FaqGrid';
import MarketingArtwork from '@web-components/content/MarketingArtwork';
import {
  CtaSection,
  NeuralGrid,
  NeuralGridItem,
  WebSection,
} from '@web-components/content/NeuralGrid';
import MarketingEntrance from '@web-components/MarketingEntrance';
import PageLayout from '@web-components/PageLayout';
import {
  Cloud,
  Cpu,
  GitBranch,
  Server,
  ShieldCheck,
  Terminal,
} from 'lucide-react';

const QUICKSTART_DOCS_URL =
  'https://docs.genfeed.ai/guides/self-host-quickstart';

const NPX_COMMAND = 'npx @genfeedai/create my-genfeed';

const BUNDLE_COMMANDS = `curl -fLO https://github.com/genfeedai/genfeed.ai/releases/latest/download/genfeed-selfhosted.tar.gz
curl -fLO https://github.com/genfeedai/genfeed.ai/releases/latest/download/genfeed-selfhosted.tar.gz.sha256
sha256sum -c genfeed-selfhosted.tar.gz.sha256
tar -xzf genfeed-selfhosted.tar.gz && cd genfeed-selfhosted-v*
cp .env.example .env && docker compose --env-file .env -f compose.yml up -d`;

const REQUIREMENTS = [
  'Docker Compose v2 (Docker Engine with the Compose plugin, or Docker Desktop)',
  'Node.js 24 (>=24 <25), only for the npx command. The release bundle does not need Node.',
  'About 10 GB of free disk (15 GB recommended)',
  'Free ports 3000 (web), 3010 (API), and 3014 (MCP)',
] as const;

const PROVIDER_KEYS = [
  'OpenRouter',
  'OpenAI',
  'Anthropic',
  'Replicate',
  'fal',
  'ElevenLabs',
] as const;

const WHY_SELF_HOST = [
  {
    description:
      'Run Genfeed on your own servers with Docker Compose: one container plus PostgreSQL. Your storage, your network, no vendor lock-in.',
    icon: Server,
    title: 'Own Your Infrastructure',
  },
  {
    description:
      'Your content, brands, and database live on your infrastructure. Generation requests go to the model providers whose keys you add.',
    icon: ShieldCheck,
    title: 'Own Your Data',
  },
  {
    description:
      'Self-hosting has no Genfeed credits. Add your own provider keys and pay those providers directly, with no Genfeed credit meter.',
    icon: Cpu,
    title: 'Bring Your Own Keys',
  },
] as const;

const FAQ_ITEMS = [
  {
    answer:
      'Yes. The core is open source under AGPL-3.0. Run it on your own infrastructure at no platform cost. You cover your own hosting and pay your model providers directly.',
    question: 'Is self-hosting really free?',
  },
  {
    answer:
      'The repository is licensed AGPL-3.0. Self-hosting for your own use is fully covered by the open-source license.',
    question: 'What is the license?',
  },
  {
    answer:
      'Self-host gives you full control and zero platform fees, but you run the infrastructure and updates yourself, and you bring your own model provider keys. Managed cloud handles all of that, adds managed credits and support, and starts free. Most teams self-host to evaluate, then move to cloud to skip the ops.',
    question: 'Self-host or managed cloud?',
  },
  {
    answer:
      'Community support lives on GitHub: issues, discussions, and the docs. Managed cloud plans add direct support and SLAs.',
    question: 'Do I get support?',
  },
  {
    answer:
      'Anytime. Start self-hosted, then move to managed cloud whenever the operational overhead outweighs the control. Your workflows and content model carry over.',
    question: 'Can I move to cloud later?',
  },
];

export default function SelfHostedContent() {
  const repoHref = EnvironmentService.github.core;
  const cloudSignUpHref = `${EnvironmentService.apps.app}/sign-up?plan=payg`;

  return (
    <MarketingEntrance hero={false} sections={false}>
      <PageLayout
        heroMedia={<MarketingArtwork page="/self-hosted" kind="integration" />}
        badge="Open Source"
        badgeIcon={GitBranch}
        title={
          <>
            Open source. Self-host on{' '}
            <span className="italic font-light">your own infra</span>.
          </>
        }
        description="Genfeed is open source under AGPL-3.0. Install it with one command or a checksummed release bundle, run it with Docker Compose, and add your own model provider keys. Or skip the ops and start free on managed cloud."
      >
        <WebSection maxWidth="lg" py="md">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button
              asChild
              size={ButtonSize.PUBLIC}
              variant={ButtonVariant.DEFAULT}
            >
              <a href={repoHref} target="_blank" rel="noopener noreferrer">
                View on GitHub
              </a>
            </Button>
            <Button
              asChild
              size={ButtonSize.PUBLIC}
              variant={ButtonVariant.SECONDARY}
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
            description="Full control over your infrastructure and data, with no platform fees and no lock-in."
            className="[&_h2]:text-4xl sm:[&_h2]:text-5xl"
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

        <WebSection bg="bordered" maxWidth="lg" className="gsap-section">
          <SectionHeader
            title="Install"
            description="Two ways to run the same Community release: one command, or the release bundle with no repository clone."
            className="[&_h2]:text-4xl sm:[&_h2]:text-5xl"
          />

          <div className="space-y-8">
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-surface">
                One command
              </h3>
              <p className="text-sm leading-relaxed text-surface/60">
                Downloads the release bundle, verifies its checksum, and starts
                it.
              </p>
              <pre className="overflow-x-auto rounded-sm border gen-border bg-card p-4 text-sm text-surface">
                {NPX_COMMAND}
              </pre>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-surface">
                Release bundle
              </h3>
              <p className="text-sm leading-relaxed text-surface/60">
                A checksummed tarball of the latest stable release that runs as
                one container alongside PostgreSQL. No git clone, no build. On
                macOS, use{' '}
                <code>shasum -a 256 -c genfeed-selfhosted.tar.gz.sha256</code>{' '}
                for the checksum step.
              </p>
              <pre className="overflow-x-auto rounded-sm border gen-border bg-card p-4 text-sm text-surface">
                {BUNDLE_COMMANDS}
              </pre>
              <p className="text-sm leading-relaxed text-surface/60">
                Then open http://localhost:3000.
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-surface">
                Requirements
              </h3>
              <ul className="space-y-2 text-sm text-surface/60">
                {REQUIREMENTS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-surface">
                Model provider keys
              </h3>
              <p className="text-sm leading-relaxed text-surface/60">
                Self-hosting does not include Genfeed credits. To generate
                content, add your own keys ({PROVIDER_KEYS.join(', ')}) to{' '}
                <code>.env</code> and pay those providers directly. An
                OpenRouter key is required for text generation; the other keys
                are optional. The Community image does not start GPU or
                local-model services.
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button
              asChild
              size={ButtonSize.PUBLIC}
              variant={ButtonVariant.SECONDARY}
            >
              <a
                href={QUICKSTART_DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Read the self-host quickstart
              </a>
            </Button>
            <Button
              asChild
              size={ButtonSize.PUBLIC}
              variant={ButtonVariant.SECONDARY}
            >
              <a href={repoHref} target="_blank" rel="noopener noreferrer">
                View the GitHub repo
              </a>
            </Button>
          </div>
        </WebSection>

        <WebSection maxWidth="lg" className="gsap-section">
          <SectionHeader
            title="Self-host or managed cloud"
            description="Same product. Self-host for control; move to cloud when you would rather not run the infrastructure."
            className="[&_h2]:text-4xl sm:[&_h2]:text-5xl"
          />

          <NeuralGrid columns={2}>
            <NeuralGridItem
              icon={Terminal}
              title="Self-host"
              tierLabel="Free / open source"
              padding="lg"
            >
              <ul className="space-y-3">
                {[
                  'Run it on your own infrastructure',
                  'Full control of your data and deployment',
                  'No Genfeed credits: bring your own provider keys',
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
              icon={Cloud}
              title="Managed cloud"
              tierLabel="Free to start"
              padding="lg"
              className="bg-[var(--gen-accent-bg)]"
            >
              <ul className="space-y-3">
                {[
                  'We run the infrastructure and updates',
                  'Managed credits: pay only for output',
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
            className="[&_h2]:text-4xl sm:[&_h2]:text-5xl"
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
    </MarketingEntrance>
  );
}
