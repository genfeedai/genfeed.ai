import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Code } from '@genfeedai/ui';
import { Button } from '@ui/primitives/button';
import { CtaSection, WebSection } from '@web-components/content/NeuralGrid';
import MarketingEntrance from '@web-components/MarketingEntrance';
import PageLayout from '@web-components/PageLayout';
import { Check, Terminal } from 'lucide-react';
import Link from 'next/link';

import CopyCommandButton from './copy-command-button';

const INSTALL_COMMAND = 'npx @genfeedai/skills-pro install sk_rcpt_xxx';

export default function SkillsSuccessContent() {
  return (
    <MarketingEntrance cards={false}>
      <PageLayout
        compact
        title={<>Purchase Complete</>}
        description="Check your email for your receipt ID, then install your skills."
      >
        <WebSection maxWidth="md" className="gsap-hero">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-foreground/5 border border-foreground/10 mb-8">
              <Check className="size-4 text-success" />
              <span className="text-foreground/60 text-sm">
                Payment confirmed
              </span>
            </div>
          </div>

          <div
            className={
              'overflow-hidden border border-foreground/10 bg-black/40' /* design-system-allow-content-color -- terminal content */
            }
          >
            <div className="flex items-center gap-2 px-4 py-3 bg-foreground/5 border-b border-foreground/10">
              <div className="flex gap-2">
                <div className="size-3 rounded-full bg-foreground/20" />
                <div className="size-3 rounded-full bg-foreground/20" />
                <div className="size-3 rounded-full bg-foreground/20" />
              </div>
              <div className="flex-1 text-center text-xs text-foreground/60 font-mono">
                terminal
              </div>
            </div>

            <div className="p-6 font-mono text-sm">
              <div className="flex items-center justify-between gap-4">
                <div className="flex gap-2 overflow-x-auto">
                  <span className="text-foreground/60">$</span>
                  <span className="text-foreground/80">{INSTALL_COMMAND}</span>
                </div>
                <CopyCommandButton command={INSTALL_COMMAND} />
              </div>
            </div>
          </div>

          <div className="mt-8 space-y-4 text-sm text-foreground/70">
            <div className="flex items-start gap-3">
              <Terminal className="size-4 mt-0.5 shrink-0 text-foreground/70" />
              <span>
                Replace{' '}
                <Code className="text-foreground/60 bg-foreground/5">
                  sk_rcpt_xxx
                </Code>{' '}
                with the receipt ID from your confirmation email.
              </span>
            </div>
            <div className="flex items-start gap-3">
              <Terminal className="size-4 mt-0.5 shrink-0 text-foreground/70" />
              <span>
                Skills are installed to{' '}
                <Code className="text-foreground/60 bg-foreground/5">
                  skills/
                </Code>{' '}
                in your project directory.
              </span>
            </div>
          </div>
        </WebSection>

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
    </MarketingEntrance>
  );
}
