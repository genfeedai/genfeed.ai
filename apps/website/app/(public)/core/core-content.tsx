'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import { EnvironmentService } from '@services/core/environment.service';
import { Button } from '@ui/primitives/button';
import {
  CtaSection,
  NeuralGrid,
  NeuralGridItem,
  WebSection,
} from '@web-components/content/NeuralGrid';
import PageLayout from '@web-components/PageLayout';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FaDiscord, FaGithub } from 'react-icons/fa6';
import {
  LuArrowRight,
  LuBug,
  LuCode,
  LuCpu,
  LuGitPullRequest,
  LuHeart,
  LuScale,
  LuStar,
  LuTerminal,
  LuUsers,
} from 'react-icons/lu';

const TERMINAL_COMMANDS = [
  { command: 'git clone https://github.com/genfeedai/core', prompt: '~' },
  { command: 'cd core', prompt: '~' },
  { command: 'docker compose up -d', prompt: '~/core' },
  { command: '# Running on http://localhost:3000', prompt: '~/core' },
] as const;

function TerminalWindow(): React.ReactElement {
  const [currentLine, setCurrentLine] = useState(0);
  const isTyping = currentLine < TERMINAL_COMMANDS.length;

  useEffect(() => {
    if (!isTyping) {
      return;
    }

    const delay = currentLine === 0 ? 800 : 1200;
    const timer = setTimeout(() => setCurrentLine((prev) => prev + 1), delay);

    return () => clearTimeout(timer);
  }, [currentLine, isTyping]);

  return (
    <div className=" overflow-hidden border border-edge/10 bg-black/40">
      <div className="flex items-center gap-2 px-4 py-3 bg-fill/5 border-b border-edge/10">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-fill/20" />
          <div className="w-3 h-3 rounded-full bg-fill/20" />
          <div className="w-3 h-3 rounded-full bg-fill/20" />
        </div>
        <div className="flex-1 text-center text-xs text-surface/30 font-mono uppercase tracking-widest">
          genfeed-core
        </div>
      </div>

      <div className="p-6 font-mono text-sm space-y-2 min-h-code-block">
        {TERMINAL_COMMANDS.slice(0, currentLine).map((line) => (
          <div key={line.command} className="flex flex-wrap gap-2">
            <span className="text-surface/30">{line.prompt}</span>
            <span className="text-surface/40">$</span>
            <span
              className={
                line.command.startsWith('#')
                  ? 'text-surface/30'
                  : 'text-surface/80'
              }
            >
              {line.command}
            </span>
          </div>
        ))}
        {isTyping && (
          <div className="flex items-center gap-2">
            <span className="text-surface/30">
              {TERMINAL_COMMANDS[currentLine]?.prompt || '~'}
            </span>
            <span className="text-surface/40">$</span>
            <span className="w-2 h-4 bg-fill/40 animate-pulse" />
          </div>
        )}
        {!isTyping && (
          <div className="pt-4 text-surface/50 flex items-center gap-2">
            <LuTerminal className="h-4 w-4" />
            Ready to generate content!
          </div>
        )}
      </div>
    </div>
  );
}

const FEATURES = [
  {
    description: 'Copyleft license that keeps the code open for everyone.',
    icon: LuScale,
    shortLabel: 'License',
    title: 'AGPL-3.0 Licensed',
  },
  {
    description: 'Complete REST API for all content generation features.',
    icon: LuCpu,
    shortLabel: 'API',
    title: 'Full API Access',
  },
  {
    description: 'Extend functionality with custom integrations.',
    icon: LuCode,
    shortLabel: 'Plugins',
    title: 'Plugin System',
  },
  {
    description: 'Join thousands of developers building with Core.',
    icon: LuUsers,
    shortLabel: 'Community',
    title: 'Active Community',
  },
];

const CONTRIBUTION_CTAS = [
  {
    href: EnvironmentService.github.core,
    icon: LuStar,
    label: 'Star on GitHub',
  },
  {
    href: EnvironmentService.github.issues,
    icon: LuBug,
    label: 'Report Issues',
  },
  {
    href: EnvironmentService.github.prs,
    icon: LuGitPullRequest,
    label: 'Submit PRs',
  },
  {
    href: EnvironmentService.social.discord,
    icon: FaDiscord,
    label: 'Join Discord',
  },
];

const STATS = [
  { icon: LuStar, label: 'GitHub Stars', value: '1.2K+' },
  { icon: LuHeart, label: 'Contributors', value: '50+' },
  { icon: FaGithub, label: 'Forks', value: '200+' },
];

export default function CoreContent() {
  const containerRef = useMarketingEntrance();

  return (
    <div ref={containerRef}>
      <PageLayout
        badge="Open Source"
        badgeIcon={LuCode}
        title={
          <>
            Genfeed <span className="italic font-light">Core</span>
          </>
        }
        description="The open-source AI content engine. Self-host on your infrastructure."
      >
        {/* Quick Start Terminal */}
        <WebSection maxWidth="lg" className="gsap-hero">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="flex flex-col justify-center">
              <div className="text-surface/20 text-xs font-black uppercase tracking-widest mb-6">
                01 / Quick Start
              </div>
              <TerminalWindow />
            </div>

            <div className="flex flex-col justify-center">
              <NeuralGrid columns={1} radius="lg">
                {STATS.map((stat, index) => {
                  const Icon = stat.icon;
                  return (
                    <NeuralGridItem
                      key={stat.label}
                      padding="sm"
                      className="flex items-center gap-6 p-8"
                    >
                      <div className="text-surface/20 text-xs font-black uppercase tracking-widest">
                        {String(index + 1).padStart(2, '0')}
                      </div>
                      <Icon className="h-6 w-6 text-surface/40 group-hover:text-surface transition-colors" />
                      <div>
                        <div className="text-3xl font-bold">{stat.value}</div>
                        <div className="text-sm text-surface/40">
                          {stat.label}
                        </div>
                      </div>
                    </NeuralGridItem>
                  );
                })}
              </NeuralGrid>
            </div>
          </div>
        </WebSection>

        {/* Features */}
        <WebSection bg="subtle">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-serif mb-6">Why Open Source?</h2>
            <p className="text-surface/50 max-w-xl mx-auto">
              Full transparency, community-driven development, and zero vendor
              lock-in.
            </p>
          </div>

          <NeuralGrid columns={4} className="gsap-grid">
            {FEATURES.map((feature, index) => (
              <NeuralGridItem
                key={feature.title}
                className="gsap-card"
                tierLabel={`${String(index + 1).padStart(2, '0')} / ${feature.shortLabel}`}
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
              />
            ))}
          </NeuralGrid>
        </WebSection>

        {/* Contribution CTAs */}
        <WebSection maxWidth="md" className="gsap-section">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-serif mb-6">Join the Community</h2>
            <p className="text-surface/50 max-w-xl mx-auto">
              Contribute to the future of AI content generation. Report bugs,
              suggest features, or submit pull requests.
            </p>
          </div>

          <NeuralGrid columns={4}>
            {CONTRIBUTION_CTAS.map((cta, index) => {
              const Icon = cta.icon;
              return (
                <Link
                  key={cta.label}
                  href={cta.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-background p-10 text-center group hover:bg-fill/[0.02] transition-colors"
                >
                  <div className="text-surface/20 text-xs font-black uppercase tracking-widest mb-6">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <Icon className="h-8 w-8 mx-auto text-surface/40 mb-4 group-hover:text-surface transition-colors" />
                  <span className="text-sm font-bold">{cta.label}</span>
                </Link>
              );
            })}
          </NeuralGrid>
        </WebSection>

        {/* Documentation CTA */}
        <CtaSection
          bg="subtle"
          title="Ready to Deploy?"
          description="Follow our comprehensive self-hosting guide for step-by-step instructions, troubleshooting, and best practices."
        >
          <Button size={ButtonSize.PUBLIC} asChild>
            <Link href="https://docs.genfeed.ai/core" target="_blank">
              Read Documentation
              <LuArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.PUBLIC}
            asChild
          >
            <Link href="/cloud">Compare with Cloud</Link>
          </Button>
        </CtaSection>
      </PageLayout>
    </div>
  );
}
