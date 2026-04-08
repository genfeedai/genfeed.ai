'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import { Button } from '@ui/primitives/button';
import PageLayout from '@web-components/PageLayout';
import Image from 'next/image';
import Link from 'next/link';
import {
  LuArrowRight,
  LuCpu,
  LuDatabase,
  LuLayers,
  LuMonitorPlay,
  LuShieldCheck,
} from 'react-icons/lu';

const FEATURES = [
  {
    description:
      'Every photo, video, and file organized and searchable. Find what you need in seconds, not minutes.',
    icon: LuDatabase,
    label: 'Asset Library',
    number: '01',
    title: 'Find Any Asset Instantly',
  },
  {
    description:
      'Access the best AI models for video, image, voice, and text — automatically selected for each task.',
    icon: LuCpu,
    label: 'AI Engine',
    number: '02',
    title: '50+ Models, One Prompt',
  },
  {
    description:
      'Enterprise-grade security. Your brand assets, custom models, and content stay private and protected.',
    icon: LuShieldCheck,
    label: 'Security',
    number: '03',
    title: 'Your Brand, Your Data',
  },
  {
    description:
      'Professional-quality videos and images ready to publish. No editing, no post-production needed.',
    icon: LuMonitorPlay,
    label: 'Quality',
    number: '04',
    title: '4K Output, Zero Post-Processing',
  },
];

export default function FeaturesPage(): React.ReactElement {
  const containerRef = useMarketingEntrance();

  return (
    <div ref={containerRef}>
      <PageLayout
        badge="Platform Capabilities"
        badgeIcon={LuLayers}
        title={
          <>
            What Genfeed Does{' '}
            <span className="text-surface italic font-light">For You</span>
          </>
        }
        description="Every feature saves you time and eliminates busywork. Here is exactly what you get."
      >
        {/* Features Grid */}
        <section className="gsap-hero py-32">
          <div className="container mx-auto px-6">
            <div className="gsap-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-fill/5 border border-edge/5 overflow-hidden">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.number}
                    className="gsap-card bg-background p-12 flex flex-col group hover:bg-fill/[0.02] transition-colors"
                  >
                    <div className="text-surface/20 text-xs font-black uppercase tracking-widest mb-12">
                      {feature.number} / {feature.label}
                    </div>
                    <Icon className="h-10 w-10 mb-8 text-surface/40 group-hover:text-surface transition-all" />
                    <h3 className="text-xl font-black uppercase tracking-tight mb-4">
                      {feature.title}
                    </h3>
                    <p className="text-surface/40 text-sm leading-relaxed mb-8">
                      {feature.description}
                    </p>
                    <span className="mt-auto text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:gap-4 transition-all cursor-pointer">
                      Learn More <LuArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Editorial Content Block */}
        <section className="gsap-section py-32 bg-fill/[0.02]">
          <div className="container mx-auto px-6">
            <div className="flex flex-col lg:flex-row gap-20 items-center">
              <div className="w-full lg:w-1/2">
                <div className="relative aspect-[4/5] overflow-hidden glass-card group">
                  <Image
                    src="https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1000&q=80&fit=crop"
                    alt="Cinematic architecture showcasing speed and precision"
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-cover group-hover:scale-110 transition-transform duration-1000"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent p-12 flex flex-col justify-end">
                    <span className="text-[10px] font-black uppercase tracking-widest text-surface/40 mb-2">
                      Case Study 01
                    </span>
                    <h4 className="text-3xl font-serif text-surface">
                      The Architecture of Speed
                    </h4>
                  </div>
                </div>
              </div>
              <div className="w-full lg:w-1/2 space-y-12">
                <div>
                  <h2 className="text-5xl font-serif mb-8">
                    Built for Speed and Quality.
                  </h2>
                  <p className="text-lg text-surface/40 leading-relaxed">
                    Genfeed uses 50+ AI models optimized for content creation.
                    Each model is selected automatically based on your prompt —
                    so you get the best quality without choosing between
                    providers or settings.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-8">
                  <div className="p-8 border border-edge/5">
                    <span className="text-4xl font-serif block mb-2">250%</span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-surface/30">
                      Efficiency Increase
                    </span>
                  </div>
                  <div className="p-8 border border-edge/5">
                    <span className="text-4xl font-serif block mb-2">0.4s</span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-surface/30">
                      Average Latency
                    </span>
                  </div>
                </div>
                <div className="pt-8">
                  <Button
                    asChild
                    variant={ButtonVariant.SECONDARY}
                    size={ButtonSize.PUBLIC}
                    className="tracking-[0.3em]"
                  >
                    <Link href="/demo">See How It Works</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-40">
          <div className="container mx-auto px-6">
            <div className="text-center max-w-3xl mx-auto">
              <h2 className="text-6xl font-serif mb-10">
                Start Creating Today
              </h2>
              <p className="text-surface/40 text-xl mb-12 font-medium">
                Start creating in minutes. Choose the plan that fits your team.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button
                  asChild
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.PUBLIC}
                  className="tracking-[0.3em]"
                >
                  <Link href="/pricing">View Plans</Link>
                </Button>
                <Button
                  asChild
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.PUBLIC}
                  className="tracking-[0.3em]"
                >
                  <Link href="/demo">See How It Works</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </PageLayout>
    </div>
  );
}
