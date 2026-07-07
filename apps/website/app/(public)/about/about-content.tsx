'use client';

import { gsapPresets, useGsapEntrance } from '@hooks/ui/use-gsap-entrance';
import ButtonRequestAccess from '@web-components/buttons/request-access/button-request-access/ButtonRequestAccess';
import {
  NeuralGrid,
  NeuralGridItem,
  WebSection,
} from '@web-components/content/NeuralGrid';
import PageLayout from '@web-components/PageLayout';
import Image from 'next/image';
import { useMemo } from 'react';

export default function AboutContent() {
  const animations = useMemo(
    () => [
      gsapPresets.fadeUp('.about-hero'),
      gsapPresets.staggerCards('.about-card', '.about-content'),
    ],
    [],
  );

  const containerRef = useGsapEntrance({ animations });

  return (
    <div ref={containerRef}>
      <PageLayout
        compact
        title="About Genfeed"
        description="Built by AI agents for creators and agencies who track revenue, not vanity metrics."
      >
        {/* Hero Image */}
        <section className="max-w-4xl mx-auto pb-12">
          <div className="relative aspect-[21/9] overflow-hidden">
            <Image
              src="https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&q=80&fit=crop"
              alt="AI content creation - abstract neural network visualization"
              fill
              sizes="(max-width: 768px) 100vw, 896px"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
          </div>
        </section>

        {/* The Problem */}
        <WebSection className="about-content pt-0" maxWidth="lg" py="md">
          <NeuralGrid columns={1}>
            <NeuralGridItem
              className="about-card"
              padding="lg"
              title="The problem"
              description="SMBs and marketing agencies use five or more tools. Nobody tracks what drives revenue. Content creation stays slow and manual."
            />
            <NeuralGridItem
              className="about-card"
              padding="lg"
              title="Why now"
              description="AI content quality now matches professional output while production costs have collapsed. Teams can create on-brand content at scale without scaling headcount."
            />
            <NeuralGridItem
              className="about-card"
              padding="lg"
              title="The solution"
              description="Discover trends, generate content in minutes, publish everywhere, track ROI, and optimize from one content intelligence platform."
            />
          </NeuralGrid>
        </WebSection>

        {/* CTA */}
        <section className="max-w-4xl mx-auto pb-20">
          <div className="bg-background p-8 text-center shadow-border-strong">
            <h2 className="text-2xl font-semibold mb-4">Get Started</h2>
            <p className="text-foreground/70 mb-6">
              Sign up, pick a plan, and start creating content at scale.
            </p>
            <ButtonRequestAccess />
          </div>
        </section>
      </PageLayout>
    </div>
  );
}
