'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import { Button } from '@ui/primitives/button';
import { CtaSection, WebSection } from '@web-components/content/NeuralGrid';
import PageLayout from '@web-components/PageLayout';
import Link from 'next/link';
import { LuCheck, LuCopy, LuTerminal } from 'react-icons/lu';

const INSTALL_COMMAND =
  'npx @genfeedai/skills-pro install --receipt sk_rcpt_xxx';

export default function SkillsSuccessContent() {
  const containerRef = useMarketingEntrance({ cards: false });

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND);
    } catch {
      // Clipboard write failed — silent fallback
    }
  }

  return (
    <div ref={containerRef}>
      <PageLayout
        badge="Complete"
        badgeIcon={LuCheck}
        title={
          <>
            Purchase <span className="italic font-light">Complete</span>
          </>
        }
        description="Check your email for your receipt ID, then install your skills."
      >
        {/* Install Instructions */}
        <WebSection maxWidth="md" className="gsap-hero">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-fill/5 border border-edge/10 mb-8">
              <LuCheck className="h-4 w-4 text-emerald-400" />
              <span className="text-surface/60 text-sm">Payment confirmed</span>
            </div>
          </div>

          {/* Terminal Block */}
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

            <div className="p-6 font-mono text-sm">
              <div className="flex items-center justify-between gap-4">
                <div className="flex gap-2 overflow-x-auto">
                  <span className="text-surface/40">$</span>
                  <span className="text-surface/80">{INSTALL_COMMAND}</span>
                </div>
                <Button
                  variant={ButtonVariant.GHOST}
                  onClick={handleCopy}
                  type="button"
                  aria-label="Copy install command"
                  title="Copy install command"
                  className="shrink-0 p-2 text-surface/30 hover:text-surface transition-colors"
                >
                  <LuCopy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-8 space-y-4 text-sm text-surface/40">
            <div className="flex items-start gap-3">
              <LuTerminal className="h-4 w-4 mt-0.5 shrink-0 text-surface/30" />
              <span>
                Replace{' '}
                <code className="text-surface/60 bg-fill/5 px-1.5 py-0.5 rounded text-xs">
                  sk_rcpt_xxx
                </code>{' '}
                with the receipt ID from your confirmation email.
              </span>
            </div>
            <div className="flex items-start gap-3">
              <LuTerminal className="h-4 w-4 mt-0.5 shrink-0 text-surface/30" />
              <span>
                Skills are installed to{' '}
                <code className="text-surface/60 bg-fill/5 px-1.5 py-0.5 rounded text-xs">
                  skills/
                </code>{' '}
                in your project directory.
              </span>
            </div>
          </div>
        </WebSection>

        {/* Back CTA */}
        <CtaSection
          bg="subtle"
          title="Ready to Go"
          description="Your agent will discover the new skills automatically on the next session."
        >
          <Button size={ButtonSize.PUBLIC} asChild>
            <Link href="/skills">Back to Skills</Link>
          </Button>
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
              Free Skills on GitHub
            </Link>
          </Button>
        </CtaSection>
      </PageLayout>
    </div>
  );
}
