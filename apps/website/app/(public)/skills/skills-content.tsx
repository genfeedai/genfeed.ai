'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import {
  HOW_IT_WORKS,
  SKILL_CATEGORIES,
  type SkillRegistry,
  type SkillRegistryEntry,
  STATS,
  TERMINAL_COMMANDS,
} from '@public/skills/_data';
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
import { useCallback, useEffect, useState } from 'react';
import { FaGithub } from 'react-icons/fa6';
import {
  LuArrowRight,
  LuBrainCircuit,
  LuCheck,
  LuCopy,
  LuLoader,
  LuSparkles,
  LuTerminal,
} from 'react-icons/lu';

/* ─── Install Command ─── */

function InstallCommand(): React.ReactElement {
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText('npx skills add genfeedai/skills');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write failed — don't show success checkmark
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="group inline-flex items-center gap-3 px-6 py-3 bg-fill/5 border border-edge/10 hover:border-edge/20 transition-all font-mono text-sm cursor-pointer"
    >
      <LuTerminal className="h-4 w-4 text-surface/30" />
      <span className="text-surface/70">npx skills add genfeedai/skills</span>
      {copied ? (
        <LuCheck className="h-4 w-4 text-emerald-400" />
      ) : (
        <LuCopy className="h-4 w-4 text-surface/30 group-hover:text-surface/60 transition-colors" />
      )}
    </button>
  );
}

/* ─── Terminal Animation ─── */

function TerminalDemo(): React.ReactElement {
  const [currentLine, setCurrentLine] = useState(0);
  const isTyping = currentLine < TERMINAL_COMMANDS.length;

  useEffect(() => {
    if (!isTyping) {
      return;
    }

    const delay = currentLine === 0 ? 800 : currentLine <= 1 ? 600 : 300;
    const timer = setTimeout(() => setCurrentLine((prev) => prev + 1), delay);

    return () => clearTimeout(timer);
  }, [currentLine, isTyping]);

  return (
    <div className="overflow-hidden border border-edge/10 bg-black/40">
      <div className="flex items-center gap-2 px-4 py-3 bg-fill/5 border-b border-edge/10">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-fill/20" />
          <div className="w-3 h-3 rounded-full bg-fill/20" />
          <div className="w-3 h-3 rounded-full bg-fill/20" />
        </div>
        <div className="flex-1 text-center text-xs text-surface/30 font-mono uppercase tracking-widest">
          terminal
        </div>
      </div>

      <div className="p-6 font-mono text-sm space-y-1.5 min-h-card">
        {TERMINAL_COMMANDS.slice(0, currentLine).map((line) => (
          <div key={line.command} className="flex flex-wrap gap-2">
            {line.prompt && (
              <span className="text-surface/30">{line.prompt}</span>
            )}
            {line.prompt && <span className="text-surface/40">$</span>}
            <span
              className={
                line.command.startsWith('#')
                  ? 'text-emerald-400/60'
                  : line.command.startsWith('\u2713')
                    ? 'text-emerald-400/40'
                    : line.command.startsWith('...')
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
              {TERMINAL_COMMANDS[currentLine]?.prompt || ''}
            </span>
            {TERMINAL_COMMANDS[currentLine]?.prompt && (
              <span className="text-surface/40">$</span>
            )}
            <span className="w-2 h-4 bg-fill/40 animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Content ─── */

interface SkillsContentProps {
  initialRegistry: SkillRegistry | null;
}

export default function SkillsContent({ initialRegistry }: SkillsContentProps) {
  const [registry] = useState<SkillRegistry | null>(initialRegistry);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const containerRef = useMarketingEntrance();

  const handleCheckout = useCallback(async () => {
    setCheckoutLoading(true);

    try {
      const response = await fetch(
        `${EnvironmentService.apiEndpoint}/skills-pro/checkout`,
        {
          body: JSON.stringify({
            cancelUrl: `${window.location.origin}/skills`,
            successUrl: `${window.location.origin}/skills/success?session_id={CHECKOUT_SESSION_ID}`,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      );

      if (!response.ok) {
        throw new Error(`Checkout failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setCheckoutLoading(false);
    }
  }, []);

  return (
    <div ref={containerRef}>
      <PageLayout
        badge="Open Source Skills"
        badgeIcon={LuBrainCircuit}
        title={
          <>
            22 Skills. <span className="italic font-light">One Command.</span>
          </>
        }
        description="Content creation, SEO, advertising, image prompting, and strategy — all as Claude Code skills. Works standalone. Works better with Genfeed."
        heroActions={
          <div className="flex flex-col items-center gap-6">
            <InstallCommand />
            <div className="flex gap-4">
              <Button size={ButtonSize.PUBLIC} asChild>
                <Link
                  href="https://github.com/genfeedai/skills"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FaGithub className="h-4 w-4" />
                  View on GitHub
                  <LuArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.PUBLIC}
                asChild
              >
                <Link
                  href="https://skills.sh/genfeedai/skills"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  skills.sh
                </Link>
              </Button>
            </div>
          </div>
        }
      >
        {/* Stats Bar */}
        <WebSection py="md" maxWidth="lg">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 gsap-hero">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-4xl font-serif mb-1">{stat.value}</div>
                <div className="text-xs font-black uppercase tracking-widest text-surface/30">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </WebSection>

        {/* Skill Categories */}
        {SKILL_CATEGORIES.map((category, catIndex) => (
          <WebSection
            key={category.id}
            bg={catIndex % 2 === 0 ? 'subtle' : 'default'}
            className="gsap-section"
          >
            <div className="text-center mb-16">
              <div className="text-surface/20 text-xs font-black uppercase tracking-widest mb-6">
                {category.label}
              </div>
              <h2 className="text-5xl font-serif mb-6">{category.title}</h2>
              <p className="text-surface/50 max-w-xl mx-auto">
                {category.subtitle}
              </p>
            </div>

            <NeuralGrid
              columns={
                category.skills.length >= 4
                  ? 3
                  : category.skills.length === 3
                    ? 3
                    : (category.skills.length as 1 | 2)
              }
              className="gsap-grid"
            >
              {category.skills.map((skill, index) => (
                <NeuralGridItem
                  key={skill.slug}
                  className="gsap-card"
                  tierLabel={`${String(index + 1).padStart(2, '0')} / ${category.label}`}
                  icon={skill.icon}
                  title={skill.name}
                  description={skill.description}
                />
              ))}
            </NeuralGrid>

            <div className="text-center mt-8">
              <code className="text-xs text-surface/25 font-mono">
                npx skills add genfeedai/skills/{category.skills[0]?.slug}
              </code>
            </div>
          </WebSection>
        ))}

        {/* Premium Skills */}
        {registry && registry.skills.length > 0 && (
          <WebSection bg="bordered" className="gsap-section">
            <div className="text-center mb-16">
              <div className="text-surface/20 text-xs font-black uppercase tracking-widest mb-6">
                Premium
              </div>
              <h2 className="text-5xl font-serif mb-6">Pro Skills</h2>
              <p className="text-surface/50 max-w-xl mx-auto">
                Deep domain skills that make your agent dramatically more
                capable. All included in the bundle.
              </p>
            </div>

            <NeuralGrid
              columns={
                registry.skills.length >= 4
                  ? 4
                  : (registry.skills.length as 1 | 2 | 3)
              }
              className="gsap-grid"
            >
              {registry.skills.map(
                (skill: SkillRegistryEntry, index: number) => (
                  <NeuralGridItem
                    key={skill.slug}
                    className="gsap-card"
                    padding="lg"
                    tierLabel={`${String(index + 1).padStart(2, '0')} / ${skill.category}`}
                    title={skill.name}
                    description={skill.description}
                  />
                ),
              )}
            </NeuralGrid>
          </WebSection>
        )}

        {/* Bundle CTA */}
        {registry && registry.skills.length > 0 && (
          <WebSection bg="subtle" className="gsap-section">
            <NeuralGrid columns={1}>
              <NeuralGridItem inverted padding="lg" align="center">
                <div className="max-w-2xl mx-auto py-8">
                  <div className="text-inv-fg/30 text-xs font-black uppercase tracking-widest mb-6">
                    All Pro Skills Included
                  </div>
                  <h2 className="text-5xl font-serif text-inv-fg mb-4">
                    Get Pro Skills
                  </h2>
                  <div className="text-6xl font-serif text-inv-fg mb-8">
                    ${registry.bundlePrice}
                  </div>
                  <Button
                    variant={ButtonVariant.BLACK}
                    size={ButtonSize.PUBLIC}
                    className="min-w-skill-col"
                    disabled={checkoutLoading}
                    onClick={() => handleCheckout()}
                  >
                    {checkoutLoading ? (
                      <LuLoader className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <LuSparkles className="h-4 w-4" />
                        Buy Bundle
                        <LuArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </NeuralGridItem>
            </NeuralGrid>
          </WebSection>
        )}

        {/* How It Works */}
        <WebSection maxWidth="lg" bg="bordered" className="gsap-section">
          <div className="text-center mb-16">
            <div className="text-surface/20 text-xs font-black uppercase tracking-widest mb-6">
              How It Works
            </div>
            <h2 className="text-5xl font-serif mb-6">
              Install. Learn. Create.
            </h2>
            <p className="text-surface/50 max-w-xl mx-auto">
              Skills are knowledge packages your agent absorbs — not plugins you
              configure.
            </p>
          </div>

          <NeuralGrid columns={4} className="gsap-grid">
            {HOW_IT_WORKS.map((step) => (
              <NeuralGridItem
                key={step.number}
                className="gsap-card"
                tierLabel={`${step.number} / ${step.title}`}
                icon={step.icon}
                title={step.title}
                description={step.description}
              />
            ))}
          </NeuralGrid>
        </WebSection>

        {/* Terminal Demo */}
        <WebSection maxWidth="lg" className="gsap-section">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div className="flex flex-col justify-center">
              <div className="text-surface/20 text-xs font-black uppercase tracking-widest mb-6">
                Quick Start
              </div>
              <h2 className="text-4xl font-serif mb-4">One Command</h2>
              <p className="text-surface/40 text-sm leading-relaxed mb-6">
                Install all 22 skills with a single command. Your agent learns
                each skill and activates it at exactly the right moment.
              </p>
              <div className="space-y-3 text-sm text-surface/40">
                <p>
                  <span className="text-surface/60 font-medium">
                    Install all:
                  </span>{' '}
                  <code className="text-surface/50 bg-fill/5 px-2 py-0.5 font-mono text-xs">
                    npx skills add genfeedai/skills
                  </code>
                </p>
                <p>
                  <span className="text-surface/60 font-medium">
                    Install one:
                  </span>{' '}
                  <code className="text-surface/50 bg-fill/5 px-2 py-0.5 font-mono text-xs">
                    npx skills add genfeedai/skills/x-content-creator
                  </code>
                </p>
              </div>
            </div>
            <div className="flex flex-col justify-center">
              <TerminalDemo />
            </div>
          </div>
        </WebSection>

        {/* Final CTA */}
        <CtaSection
          bg="subtle"
          title="Start Creating"
          description="22 free skills. Every platform. One install. Upgrade to Pro for deep domain skills."
        >
          {registry && registry.skills.length > 0 && (
            <Button
              size={ButtonSize.PUBLIC}
              onClick={() => handleCheckout()}
              disabled={checkoutLoading}
            >
              {checkoutLoading ? (
                <LuLoader className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <LuSparkles className="h-4 w-4" />
                  Get Pro Skills — ${registry.bundlePrice}
                </>
              )}
            </Button>
          )}
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.PUBLIC}
            asChild
          >
            <Link
              href="https://github.com/genfeedai/skills"
              target="_blank"
              rel="noopener noreferrer"
            >
              <FaGithub className="h-4 w-4" />
              Free Skills on GitHub
            </Link>
          </Button>
        </CtaSection>
      </PageLayout>
    </div>
  );
}
