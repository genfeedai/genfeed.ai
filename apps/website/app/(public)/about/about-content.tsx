'use client';

import { gsapPresets, useGsapEntrance } from '@hooks/ui/use-gsap-entrance';
import ButtonRequestAccess from '@web-components/buttons/request-access/button-request-access/ButtonRequestAccess';
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
        title="About Genfeed"
        description="About Genfeed - Built by AI, for creators who track revenue"
      >
        {/* Hero */}
        <section className="about-hero max-w-4xl mx-auto py-20 text-center">
          <h1 className="font-serif-italic text-5xl md:text-6xl mb-4">
            About <span className="text-primary">Genfeed</span>
          </h1>
          <p className="text-xl text-foreground/70">
            Built by AI agents. For SMBs and marketing agencies who track
            revenue, not likes.
          </p>
        </section>

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
        <section className="about-content max-w-4xl mx-auto pb-20 space-y-8">
          <div className="about-card node-card bg-card border border-edge/[0.08] p-8">
            <h2 className="text-2xl font-bold mb-4">The Problem</h2>
            <p className="text-foreground/70">
              SMBs and marketing agencies use 5+ tools. Nobody tracks what
              drives revenue. Content creation is slow and manual—taking days or
              weeks instead of minutes.
            </p>
          </div>

          <div className="about-card node-card bg-card border border-edge/[0.08] p-8">
            <h2 className="text-2xl font-bold mb-4">Why Now?</h2>
            <p className="text-foreground/70">
              AI content generation just hit a critical threshold: quality now
              matches human output while production costs dropped 95%. This
              technology inflection point enables what was previously
              impossible—creating professional, on-brand content at scale
              without scaling headcount.
            </p>
          </div>

          <div className="about-card node-card bg-card border border-edge/[0.08] p-8">
            <h2 className="text-2xl font-bold mb-4">The Solution</h2>
            <p className="text-foreground/70">
              Genfeed: Discover trends → Generate content in minutes → Publish
              everywhere → Track ROI → Optimize. All in one content intelligence
              platform.
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-4xl mx-auto pb-20">
          <div className="bg-card border border-edge/[0.08] shadow-[0_0_100px_rgba(255,255,255,0.2),inset_0_0_40px_rgba(255,255,255,0.05)] p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">Get Started</h2>
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
