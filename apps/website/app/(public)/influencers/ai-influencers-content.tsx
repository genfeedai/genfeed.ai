'use client';

import { gsapPresets, useGsapEntrance } from '@hooks/ui/use-gsap-entrance';
import Card from '@ui/card/Card';
import PricingStrip from '@ui/marketing/PricingStrip';
import PageLayout from '@web-components/PageLayout';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo } from 'react';
import { FaInstagram, FaTiktok, FaXTwitter, FaYoutube } from 'react-icons/fa6';
import {
  HiArrowRight,
  HiBolt,
  HiChatBubbleLeftRight,
  HiMicrophone,
  HiRocketLaunch,
  HiSparkles,
  HiUserGroup,
} from 'react-icons/hi2';

const METRICS = [
  {
    after: '$99/mo',
    before: '$10K/mo',
    label: 'Cost per Influencer',
  },
  {
    after: '24/7 always-on',
    before: '8 hrs/day max',
    label: 'Content Availability',
  },
  {
    after: 'Fully controlled',
    before: '1 personality',
    label: 'Brand Safety',
  },
];

const FEATURES = [
  {
    description:
      'Define personality, voice, visual style, and brand guidelines for each AI influencer.',
    icon: HiUserGroup,
    title: 'Persona Creation',
  },
  {
    description:
      'Generate photorealistic avatars powered by HeyGen and Hedra for video and image content.',
    icon: HiSparkles,
    title: 'AI Avatar Generation',
  },
  {
    description:
      'Clone any voice with ElevenLabs synthesis for authentic, on-brand audio content.',
    icon: HiMicrophone,
    title: 'Voice Cloning',
  },
  {
    description:
      'Automated content generation and scheduling across all formats — video, image, and text.',
    icon: HiBolt,
    title: 'Content Pipeline',
  },
  {
    description:
      'Publish to Instagram, TikTok, YouTube, and Twitter simultaneously from one dashboard.',
    icon: HiRocketLaunch,
    title: 'Multi-Platform Publishing',
  },
  {
    description:
      'Automated comment replies and DMs to grow followers and drive conversions.',
    icon: HiChatBubbleLeftRight,
    title: 'Auto-Engagement',
  },
];

const STEPS = [
  {
    description:
      'Set personality traits, brand voice, visual style, and content guidelines.',
    title: 'Define Your Persona',
  },
  {
    description:
      'Create photorealistic AI avatars with customizable appearance and expressions.',
    title: 'Generate Your Avatar',
  },
  {
    description:
      'Set up automated content creation with AI-generated scripts, visuals, and captions.',
    title: 'Create Content Pipeline',
  },
  {
    description:
      'Auto-publish across platforms with engagement agents that reply to comments and send DMs.',
    title: 'Publish & Engage',
  },
];

const USE_CASES = [
  {
    description:
      'Launch AI brand ambassadors that model products, create tutorials, and engage with followers around the clock.',
    imageUrl:
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&q=80&fit=crop',
    title: 'Fashion & Beauty Brands',
  },
  {
    description:
      'Build thought-leader personas that demo features, share tips, and nurture leads through social content.',
    imageUrl:
      'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&q=80&fit=crop',
    title: 'SaaS Companies',
  },
  {
    description:
      'Create product reviewers and unboxing influencers that drive traffic and conversions at scale.',
    imageUrl:
      'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600&q=80&fit=crop',
    title: 'E-Commerce',
  },
  {
    description:
      'Scale your personal brand with AI clones that maintain your voice and style across every platform.',
    imageUrl:
      'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=600&q=80&fit=crop',
    title: 'Personal Branding',
  },
];

const INFLUENCERS_JSON_LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  applicationCategory: 'BusinessApplication',
  description:
    'Create AI influencers that post, engage, and grow audiences 24/7. Build virtual influencers with AI avatars, voice cloning, and automated content pipelines.',
  name: 'Genfeed AI Influencer Platform',
  offers: {
    '@type': 'Offer',
    price: '99',
    priceCurrency: 'USD',
  },
  operatingSystem: 'Web',
  url: 'https://genfeed.ai/influencers',
});

export default function AiInfluencersContent() {
  const animations = useMemo(
    () => [
      gsapPresets.fadeUp('.gsap-hero'),
      gsapPresets.staggerCards('.gsap-card', '.gsap-grid'),
      gsapPresets.fadeUp('.gsap-section', '.gsap-section'),
    ],
    [],
  );

  const containerRef = useGsapEntrance({ animations });

  return (
    <div ref={containerRef}>
      <PageLayout
        title="AI Influencer Platform"
        description="Create AI influencers that post, engage, and grow audiences 24/7."
      >
        {/* Platform Icons */}
        <section className="gsap-hero max-w-4xl mx-auto pb-8">
          <div className="flex justify-center gap-6 text-foreground/40">
            <FaInstagram className="h-6 w-6" />
            <FaTiktok className="h-6 w-6" />
            <FaYoutube className="h-6 w-6" />
            <FaXTwitter className="h-6 w-6" />
          </div>
        </section>

        {/* Before/After Metrics */}
        <section className="max-w-4xl mx-auto pb-16">
          <div className="gsap-grid grid grid-cols-1 md:grid-cols-3 gap-6">
            {METRICS.map((metric) => (
              <Card key={metric.label} className="gsap-card text-center">
                <p className="text-sm text-foreground/60 mb-4">
                  {metric.label}
                </p>
                <div className="space-y-2">
                  <p className="text-foreground/50 line-through">
                    {metric.before}
                  </p>
                  <p className="text-3xl font-bold text-primary">
                    {metric.after}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Value Prop */}
        <section className="max-w-4xl mx-auto pb-16">
          <Card className="bg-gradient-to-r from-primary/5 to-secondary/5">
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="flex-shrink-0">
                <div className="p-6 bg-primary/10">
                  <HiSparkles className="h-16 w-16 text-primary" />
                </div>
              </div>
              <div>
                <h3 className="text-2xl font-bold mb-2">
                  Your Brand, Always On
                </h3>
                <p className="text-foreground/70 mb-4">
                  AI influencers never go off-script, never sleep, and scale to
                  any number of platforms. Full creative control with zero risk
                  of brand-damaging posts.
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 rounded-full bg-background/50 text-sm">
                    Always-on
                  </span>
                  <span className="px-3 py-1 rounded-full bg-background/50 text-sm">
                    Brand-safe
                  </span>
                  <span className="px-3 py-1 rounded-full bg-background/50 text-sm">
                    Scalable
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* AI Avatar Showcase */}
          <div className="grid grid-cols-4 gap-4 mt-8">
            {[
              {
                alt: 'AI influencer persona - fashion',
                src: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&q=80&fit=crop',
              },
              {
                alt: 'AI influencer persona - lifestyle',
                src: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80&fit=crop',
              },
              {
                alt: 'AI influencer persona - beauty',
                src: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&q=80&fit=crop',
              },
              {
                alt: 'AI influencer persona - professional',
                src: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&q=80&fit=crop',
              },
            ].map((img) => (
              <div
                key={img.alt}
                className="aspect-[3/4] relative overflow-hidden"
              >
                <Image
                  src={img.src}
                  alt={img.alt}
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              </div>
            ))}
          </div>
        </section>

        {/* Features Grid */}
        <section className="gsap-section max-w-6xl mx-auto pb-16">
          <h3 className="text-2xl font-bold text-center mb-8">
            Everything You Need to Build Virtual Influencers
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.title} className="text-center">
                  <div className="flex justify-center mb-4">
                    <div className="p-3 bg-primary/10">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                  <h4 className="font-semibold mb-2">{feature.title}</h4>
                  <p className="text-sm text-foreground/70">
                    {feature.description}
                  </p>
                </Card>
              );
            })}
          </div>
        </section>

        {/* How It Works */}
        <section className="gsap-section max-w-4xl mx-auto pb-16">
          <h3 className="text-2xl font-bold text-center mb-8">
            How to Create an AI Influencer
          </h3>
          <div className="space-y-4">
            {STEPS.map((step, index) => (
              <Card key={step.title}>
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">
                      {index + 1}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">{step.title}</h4>
                    <p className="text-foreground/70">{step.description}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Use Cases */}
        <section className="max-w-4xl mx-auto pb-16">
          <h3 className="text-2xl font-bold text-center mb-8">
            AI Influencer Marketing Use Cases
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {USE_CASES.map((useCase) => (
              <Card key={useCase.title} className="overflow-hidden p-0">
                <div className="relative h-40 w-full">
                  <Image
                    src={useCase.imageUrl}
                    alt={useCase.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                </div>
                <div className="p-6">
                  <h4 className="font-semibold mb-2">{useCase.title}</h4>
                  <p className="text-foreground/70">{useCase.description}</p>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="max-w-4xl mx-auto pb-16">
          <Card className="text-center bg-background/50">
            <h3 className="text-2xl font-bold mb-2">
              Build Your AI Influencer
            </h3>
            <p className="text-foreground/70 mb-6 max-w-lg mx-auto">
              Launch your first virtual influencer today. Create content, grow
              audiences, and drive conversions — all on autopilot.
            </p>
            <PricingStrip className="mb-6" />
            <div className="flex flex-wrap gap-4 justify-center">
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 gap-2 font-medium transition-colors"
              >
                View Pricing
                <HiArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="https://attentionntwrk.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center border border-input hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 gap-2 font-medium transition-colors"
              >
                Explore AI Influencer Network
                <HiArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/demo"
                className="inline-flex items-center justify-center border border-input hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 gap-2 font-medium transition-colors"
              >
                Book a Demo
              </Link>
            </div>
          </Card>
        </section>

        {/* JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          // Trusted static JSON-LD payload (no user-controlled content).
          dangerouslySetInnerHTML={{
            __html: INFLUENCERS_JSON_LD,
          }}
        />
      </PageLayout>
    </div>
  );
}
