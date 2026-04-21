'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useGsapTimeline } from '@hooks/ui/use-gsap-entrance';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { HStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  HiBookmark,
  HiChatBubbleOvalLeft,
  HiCheckBadge,
  HiEllipsisHorizontal,
  HiHeart,
  HiPaperAirplane,
  HiSparkles,
} from 'react-icons/hi2';
import { LuArrowRight } from 'react-icons/lu';

interface HeroPost {
  avatar: string;
  caption: string;
  handle: string;
  imageUrl: string;
  likes: string;
  status: string;
  time: string;
}

const HERO_TIMELINE_STEPS = [
  {
    duration: 0.8,
    from: { opacity: 0, y: 20 },
    selector: '.hero-badge',
  },
  {
    duration: 1,
    from: { opacity: 0, y: 30 },
    offset: '-=0.4',
    selector: '.hero-headline',
  },
  {
    duration: 0.8,
    from: { opacity: 0, y: 20 },
    offset: '-=0.5',
    selector: '.hero-description',
  },
  {
    duration: 0.8,
    from: { opacity: 0, y: 20 },
    offset: '-=0.4',
    selector: '.hero-cta',
    stagger: 0.1,
  },
];

const HERO_POSTS: HeroPost[] = [
  {
    avatar:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=96&q=80&fit=crop&crop=face',
    caption:
      'Tokyo midnight drop for Client A. Approved, captioned, and scheduled before breakfast.',
    handle: 'kai.travels',
    imageUrl:
      'https://images.unsplash.com/photo-1492106087820-71f1a00d2b11?w=900&q=80&fit=crop',
    likes: '21,503',
    status: 'Client approved',
    time: '8 hours ago',
  },
  {
    avatar:
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=96&q=80&fit=crop&crop=face',
    caption:
      'Fashion creator pack generated from one brief with brand-safe styling locked in.',
    handle: 'nova.styles',
    imageUrl:
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=900&q=80&fit=crop',
    likes: '18,240',
    status: 'Ready to publish',
    time: '3 hours ago',
  },
  {
    avatar:
      'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=96&q=80&fit=crop&crop=face',
    caption:
      'Beauty vertical for a client launch. Hooks, variants, and KPI tracking already queued.',
    handle: 'aria.digital',
    imageUrl:
      'https://images.unsplash.com/photo-1504703395950-b89145a5425b?w=900&q=80&fit=crop',
    likes: '27,991',
    status: 'Tracking live',
    time: '45 minutes ago',
  },
];

const CARD_CYCLE_MS = 3600;

const DECK_POSITIONS = [
  { opacity: 1, rotate: 0, scale: 1, x: 0, y: 0, z: 30 },
  { opacity: 0.52, rotate: -4, scale: 0.95, x: -18, y: 10, z: 20 },
  { opacity: 0.32, rotate: 5, scale: 0.92, x: 20, y: 16, z: 10 },
] as const;

export default function HomeHero(): React.ReactElement {
  const heroRef = useGsapTimeline<HTMLElement>({ steps: HERO_TIMELINE_STEPS });
  const [activeCard, setActiveCard] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveCard((current) => (current + 1) % HERO_POSTS.length);
    }, CARD_CYCLE_MS);

    return () => window.clearInterval(interval);
  }, []);

  const cardOrder = useMemo(
    () =>
      HERO_POSTS.map((_, index) => {
        const position =
          (index - activeCard + HERO_POSTS.length) % HERO_POSTS.length;
        return { ...DECK_POSITIONS[position], index };
      }),
    [activeCard],
  );

  return (
    <section
      ref={heroRef}
      className="relative overflow-hidden gen-vignette gen-spotlight-left gen-venetian gen-grain"
    >
      <div
        className="absolute inset-0 pointer-events-none z-[3]"
        style={{ overflow: 'hidden' }}
      >
        <div
          className="absolute left-0 right-0 h-px"
          style={{
            animation: 'gen-scan 8s linear infinite',
            background:
              'linear-gradient(90deg, transparent, var(--gen-accent-glow), transparent)',
          }}
        />
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <div className="grid min-h-[calc(100svh-5.5rem)] items-center gap-12 py-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(380px,1.1fr)] lg:gap-16 lg:py-10">
          <div className="max-w-2xl self-center">
            <HStack className="hero-badge opacity-0 inline-flex items-center gap-2 px-4 py-1.5 gen-badge text-[10px] font-black uppercase tracking-[0.2em]">
              <HiSparkles className="h-3 w-3" />
              <Text>Public beta</Text>
            </HStack>

            <Heading
              as="h1"
              className="hero-headline opacity-0 mt-6 text-5xl font-serif leading-[0.9] tracking-[-0.05em] sm:text-6xl md:text-7xl lg:text-[5.9rem]"
            >
              Your Content
              <br />
              Operating System.
            </Heading>

            <Text
              as="p"
              className="hero-description opacity-0 mt-6 max-w-xl text-lg leading-relaxed gen-text-muted md:text-xl"
            >
              Run AI influencer production, approvals, publishing, and
              performance tracking for every client brand from one system.
            </Text>

            <HStack className="mt-8 flex-wrap gap-4">
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                className="hero-cta opacity-0 shadow-[var(--shadow-glow-md)]"
                trackingData={{
                  action: EnvironmentService.isPreLaunch
                    ? 'book_call_hero'
                    : 'signup_hero',
                }}
                trackingName="hero_cta_click"
              >
                <a
                  href={
                    EnvironmentService.isPreLaunch
                      ? EnvironmentService.calendly
                      : `${EnvironmentService.apps.app}/sign-up`
                  }
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {EnvironmentService.isPreLaunch
                    ? 'Book a Call'
                    : 'Start Creating'}
                  <LuArrowRight className="h-4 w-4" />
                </a>
              </ButtonTracked>

              <ButtonTracked
                asChild
                className="hero-cta opacity-0"
                size={ButtonSize.PUBLIC}
                trackingData={{ action: 'view_pricing_hero' }}
                trackingName="hero_cta_click"
                variant={ButtonVariant.OUTLINE}
              >
                <Link href="/pricing">View Pricing</Link>
              </ButtonTracked>
            </HStack>
          </div>

          <div className="hero-cta opacity-0 flex w-full items-center justify-center lg:justify-end">
            <div
              className="relative w-full max-w-[460px]"
              data-testid="home-hero-card-deck"
              style={{ height: 640 }}
            >
              <div className="pointer-events-none absolute -left-12 top-12 h-32 w-32 rounded-full bg-[var(--gen-accent-glow)] blur-3xl opacity-25" />
              <div className="pointer-events-none absolute -right-10 bottom-16 h-40 w-40 rounded-full bg-white/6 blur-3xl" />

              {cardOrder.map(({ index, opacity, rotate, scale, x, y, z }) => {
                const post = HERO_POSTS[index];
                const isFrontCard = z === 30;

                return (
                  <article
                    key={post.handle}
                    className="absolute inset-x-0 top-0 overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(21,21,24,0.96),rgba(9,9,11,0.98))] shadow-[0_28px_80px_rgba(0,0,0,0.48)] transition-all duration-700 ease-out"
                    style={{
                      opacity,
                      transform: `translateX(${x}px) translateY(${y}px) rotate(${rotate}deg) scale(${scale})`,
                      zIndex: z,
                    }}
                  >
                    <div className="flex items-center gap-3 border-b border-white/8 px-5 py-4">
                      <div className="relative h-11 w-11 overflow-hidden rounded-full ring-2 ring-fuchsia-500/55 ring-offset-2 ring-offset-black">
                        <Image
                          alt=""
                          className="object-cover"
                          fill
                          sizes="44px"
                          src={post.avatar}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-white">
                            {post.handle}
                          </p>
                          <HiCheckBadge className="h-4 w-4 shrink-0 text-sky-400" />
                        </div>
                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-white/42">
                          <span>Instagram preview</span>
                          <span className="h-1 w-1 rounded-full bg-white/20" />
                          <span>{post.status}</span>
                        </div>
                      </div>

                      <HiEllipsisHorizontal className="h-5 w-5 text-white/40" />
                    </div>

                    <div className="relative aspect-[4/5] overflow-hidden bg-white/5">
                      <Image
                        alt={`${post.handle} post`}
                        className="absolute inset-0 h-full w-full object-cover"
                        width={900}
                        height={1125}
                        priority={isFrontCard}
                        sizes="(max-width: 1024px) 0px, 440px"
                        src={post.imageUrl}
                      />
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.08)_50%,rgba(0,0,0,0.42))]" />

                      <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
                        <div className="rounded-full border border-white/12 bg-black/45 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/72 backdrop-blur-sm">
                          AI influencer avatar
                        </div>
                        <div className="rounded-full border border-emerald-400/18 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-200 backdrop-blur-sm">
                          Live campaign
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 px-5 py-4">
                      <div className="flex items-center justify-between text-white/70">
                        <div className="flex items-center gap-4 text-xl">
                          <HiHeart className="h-6 w-6 text-red-400" />
                          <HiChatBubbleOvalLeft className="h-6 w-6" />
                          <HiPaperAirplane className="h-6 w-6" />
                        </div>
                        <HiBookmark className="h-6 w-6" />
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-white">
                          {post.likes} likes
                        </p>
                        <p className="text-sm leading-relaxed text-white/72">
                          <span className="font-semibold text-white">
                            {post.handle}
                          </span>{' '}
                          {post.caption}{' '}
                          <span className="text-sky-300">#AIInfluencer</span>{' '}
                          <span className="text-sky-300">#Genfeed</span>
                        </p>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-white/34">
                          {post.time}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
