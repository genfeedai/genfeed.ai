'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { FaXTwitter } from 'react-icons/fa6';
import { HiSparkles } from 'react-icons/hi2';

const TWITTER_INTENT_URL =
  'https://twitter.com/intent/tweet?text=@genfeedai%20I%20want%20$GEN!';

export default function GenContent() {
  const containerRef = useMarketingEntrance({ cards: false, sections: false });

  return (
    <div ref={containerRef}>
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-lg w-full text-center">
          <div className="mb-8 gsap-hero">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 mb-6">
              <HiSparkles className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">$GEN Token</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Should We Launch a Token?
            </h1>

            <p className="text-lg text-foreground/70">
              We&apos;re exploring creator rewards. Let us know if you want
              $GEN.
            </p>
          </div>

          <Card className="bg-gradient-to-r from-primary/5 to-secondary/5 gsap-section">
            <div className="flex flex-col items-center gap-6 py-4">
              <div className="p-4 rounded-full bg-black">
                <FaXTwitter className="h-8 w-8 text-surface" />
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-2">
                  Tweet at us if you want $GEN
                </h2>
                <p className="text-sm text-foreground/60">
                  Your voice matters. Help us decide.
                </p>
              </div>

              <Button asChild variant={ButtonVariant.BLACK}>
                <Link
                  href={TWITTER_INTENT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FaXTwitter className="h-5 w-5" />
                  Tweet @genfeedai
                </Link>
              </Button>
            </div>
          </Card>

          <p className="text-sm text-foreground/50 mt-8">
            Nothing is promised. This is just a community pulse check.
          </p>
        </div>
      </div>
    </div>
  );
}
