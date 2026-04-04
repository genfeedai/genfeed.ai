'use client';

import { gsapPresets, useGsapEntrance } from '@hooks/ui/use-gsap-entrance';
import Card from '@ui/card/Card';
import ButtonRequestAccess from '@web-components/buttons/request-access/button-request-access/ButtonRequestAccess';
import PageLayout from '@web-components/PageLayout';
import { useMemo } from 'react';

export default function DemoContent() {
  const animations = useMemo(
    () => [
      gsapPresets.fadeUp('.gsap-hero'),
      gsapPresets.fadeUp('.gsap-section', '.gsap-section'),
    ],
    [],
  );

  const containerRef = useGsapEntrance({ animations });

  return (
    <div ref={containerRef}>
      <PageLayout
        title="Demo"
        description="Watch Genfeed create content, publish everywhere, and track revenue in real-time"
      >
        {/* Hero */}
        <section className="gsap-hero max-w-4xl mx-auto py-20 text-center">
          <h1 className="text-5xl font-bold mb-4">Demo</h1>
          <p className="text-xl text-muted-foreground">
            See how Genfeed works.
          </p>
        </section>

        {/* Demo Video */}
        <section className="gsap-section max-w-4xl mx-auto pb-20">
          <Card>
            <div className="aspect-video bg-card flex items-center justify-center border-2 border-edge/[0.08]">
              <div className="text-center">
                <p className="text-xl font-bold mb-2">Demo Video Coming Soon</p>
                <p className="text-muted-foreground text-sm">
                  Sign up to get notified when it launches
                </p>
              </div>
            </div>
          </Card>
        </section>

        {/* CTA */}
        <section className="gsap-section max-w-4xl mx-auto pb-20">
          <Card label="Get Started" bodyClassName="text-center">
            <p className="text-muted-foreground mb-6">
              Sign up and start creating content in minutes.
            </p>
            <ButtonRequestAccess />
          </Card>
        </section>
      </PageLayout>
    </div>
  );
}
