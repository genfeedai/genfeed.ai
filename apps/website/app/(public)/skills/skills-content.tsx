'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { Code } from '@genfeedai/ui';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import {
  FREE_SKILL_COUNT,
  SKILL_CATEGORIES,
  type SkillRegistry,
  type SkillRegistryEntry,
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
import { useCallback, useState } from 'react';
import { FaGithub } from 'react-icons/fa6';
import {
  LuArrowRight,
  LuBrainCircuit,
  LuLoader,
  LuSparkles,
} from 'react-icons/lu';
import InstallCommand from './install-command';
import SkillsBundleCta from './skills-bundle-cta';
import SkillsHowItWorks from './skills-how-it-works';
import SkillsStatsBar from './skills-stats-bar';
import TerminalDemo from './terminal-demo';

/* ─── Main Content ─── */

interface SkillsContentProps {
  initialRegistry: SkillRegistry | null;
}

export default function SkillsContent({ initialRegistry }: SkillsContentProps) {
  const registry = initialRegistry;
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
        compact
        title={<>{FREE_SKILL_COUNT} Skills. One Command.</>}
        description="Content creation, SEO, advertising, GTM, image prompting, platform development, and analysis as Claude Code skills. Works standalone. Works better with Genfeed."
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
                  <FaGithub className="size-4" />
                  View on GitHub
                  <LuArrowRight className="size-4" />
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
        <SkillsStatsBar />

        {/* Skill Categories */}
        {SKILL_CATEGORIES.map((category, catIndex) => (
          <WebSection
            key={category.id}
            bg={catIndex % 2 === 0 ? 'subtle' : 'default'}
            className="gsap-section"
          >
            <div className="text-center mb-16">
              <div className="text-surface/50 text-xs font-black uppercase tracking-widest mb-6">
                {category.label}
              </div>
              <h2 className="text-5xl font-semibold mb-6">{category.title}</h2>
              <p className="text-surface/65 max-w-xl mx-auto">
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
              <Code className="bg-transparent text-surface/25">
                bunx skills add genfeedai/skills/{category.skills[0]?.slug}
              </Code>
            </div>
          </WebSection>
        ))}

        {/* Premium Skills */}
        {registry && registry.skills.length > 0 && (
          <WebSection bg="bordered" className="gsap-section">
            <div className="text-center mb-16">
              <div className="text-surface/50 text-xs font-black uppercase tracking-widest mb-6">
                Premium
              </div>
              <h2 className="text-5xl font-semibold mb-6">Pro Skills</h2>
              <p className="text-surface/65 max-w-xl mx-auto">
                Paid operating systems for source-to-brief, brand voice,
                production queues, performance loops, and platform warmup. All
                included in the bundle.
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
          <SkillsBundleCta
            bundlePrice={registry.bundlePrice}
            checkoutLoading={checkoutLoading}
            onCheckout={handleCheckout}
          />
        )}

        {/* How It Works */}
        <SkillsHowItWorks />

        {/* Terminal Demo */}
        <WebSection maxWidth="lg" className="gsap-section">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div className="flex flex-col justify-center">
              <div className="text-surface/50 text-xs font-black uppercase tracking-widest mb-6">
                Quick Start
              </div>
              <h2 className="text-4xl font-semibold mb-4">One Command</h2>
              <p className="text-surface/65 text-sm leading-relaxed mb-6">
                Install all {FREE_SKILL_COUNT} free skills with a single
                command. Your agent learns each skill and activates it at
                exactly the right moment.
              </p>
              <div className="space-y-3 text-sm text-surface/65">
                <p>
                  <span className="text-surface/60 font-medium">
                    Install all:
                  </span>{' '}
                  <Code className="text-surface/50 bg-fill/5">
                    bunx skills add genfeedai/skills
                  </Code>
                </p>
                <p>
                  <span className="text-surface/60 font-medium">
                    Install one:
                  </span>{' '}
                  <Code className="text-surface/50 bg-fill/5">
                    bunx skills add genfeedai/skills/x-content-creator
                  </Code>
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
          description={`${FREE_SKILL_COUNT} free skills. Every platform. One install. Upgrade to Pro for warmup and deep operating systems.`}
        >
          {registry && registry.skills.length > 0 && (
            <Button
              size={ButtonSize.PUBLIC}
              onClick={() => handleCheckout()}
              disabled={checkoutLoading}
            >
              {checkoutLoading ? (
                <LuLoader className="size-4 animate-spin" />
              ) : (
                <>
                  <LuSparkles className="size-4" />
                  Get Pro Skills: ${registry.bundlePrice}
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
              <FaGithub className="size-4" />
              Free Skills on GitHub
            </Link>
          </Button>
        </CtaSection>
      </PageLayout>
    </div>
  );
}
