'use client';

import { CardVariant } from '@genfeedai/enums';
import { useAnimatedCounter } from '@hooks/ui/use-animated-counter/use-animated-counter';
import { useDelayedVisibility } from '@hooks/ui/use-delayed-visibility';
import { useIntersectionObserver } from '@hooks/ui/use-intersection-observer/use-intersection-observer';
import Card from '@ui/card/Card';
import { HStack, VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import Image from 'next/image';
import { FaInstagram, FaTiktok, FaYoutube } from 'react-icons/fa6';
import { HiEye, HiHeart, HiPlay } from 'react-icons/hi2';

interface AnimatedStatProps {
  end: number;
  suffix: string;
  label: string;
  highlight?: boolean;
}

function AnimatedStat({ end, suffix, label, highlight }: AnimatedStatProps) {
  const { ref, value } = useAnimatedCounter({ duration: 2000, end, suffix });

  return (
    <div
      ref={ref}
      className="p-6 bg-fill/5 border border-edge/[0.08] flex flex-col justify-center text-center"
    >
      <div
        className={`text-3xl font-serif italic ${highlight ? 'text-primary' : 'text-foreground'}`}
      >
        {value}
      </div>
      <div className="text-[10px] font-black tracking-[0.2em] uppercase text-surface/30">
        {label}
      </div>
    </div>
  );
}

const STATS = [
  { end: 50, highlight: true, label: 'Total Views', suffix: 'M+' },
  { end: 10, highlight: false, label: 'Creators', suffix: 'K+' },
  { end: 500, highlight: false, label: 'Videos Created', suffix: 'K+' },
  { end: 85, highlight: true, label: 'Time Saved', suffix: '%' },
] as const;

interface ResultCardProps {
  creator: string;
  delay: number;
  handle: string;
  metric: string;
  platform: 'tiktok' | 'youtube' | 'instagram';
  thumbnail: string;
  title: string;
  videoId?: string;
}

const PLATFORM_CONFIG = {
  instagram: {
    color: 'from-pink-500 to-purple-500',
    icon: FaInstagram,
    name: 'Instagram',
  },
  tiktok: {
    color: 'from-[#25F4EE] to-[#FE2C55]',
    icon: FaTiktok,
    name: 'TikTok',
  },
  youtube: {
    color: 'from-red-500 to-red-600',
    icon: FaYoutube,
    name: 'YouTube',
  },
};

const RESULTS = [
  {
    creator: 'OpenAI',
    handle: '@openai',
    metric: '2.4M views',
    platform: 'tiktok' as const,
    thumbnail:
      'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=400&q=80&fit=crop',
    title: 'Sora Style Transform',
  },
  {
    creator: 'OpenAI',
    handle: '@openai',
    metric: '1.8M views',
    platform: 'tiktok' as const,
    thumbnail:
      'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=400&q=80&fit=crop',
    title: 'Snowy Tokyo',
  },
  {
    creator: 'OpenAI',
    handle: '@openai',
    metric: '1.5M views',
    platform: 'tiktok' as const,
    thumbnail:
      'https://images.unsplash.com/photo-1444464666168-49d633b86797?w=400&q=80&fit=crop',
    title: 'Victoria Crowned Pigeon',
  },
  {
    creator: 'Cleo Abram',
    handle: '@cleoabram',
    metric: '3.2M views',
    platform: 'tiktok' as const,
    thumbnail:
      'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&q=80&fit=crop',
    title: 'AI Videos Are WILD',
  },
  {
    creator: 'AI For Humans',
    handle: '@aiforhumansshow',
    metric: '890K views',
    platform: 'tiktok' as const,
    thumbnail:
      'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=400&q=80&fit=crop',
    title: 'Sora Announcement',
  },
  {
    creator: 'Sturdy Digital',
    handle: '@evhandd',
    metric: '1.1M views',
    platform: 'tiktok' as const,
    thumbnail:
      'https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=400&q=80&fit=crop',
    title: 'Sora Is 10x Crazier',
  },
];

function ResultCard({
  creator,
  handle,
  metric,
  platform,
  thumbnail,
  title,
  delay,
  videoId,
}: ResultCardProps) {
  const visible = useDelayedVisibility({ delay });
  const { icon: PlatformIcon, color, name } = PLATFORM_CONFIG[platform];
  const _username = handle.replace('@', '');

  return (
    <div
      className={`transition-all duration-700 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
    >
      <Card
        variant={CardVariant.DEFAULT}
        className="overflow-hidden hover:shadow-xl group p-0"
      >
        {/* TikTok Embed or Thumbnail */}
        {videoId && platform === 'tiktok' ? (
          <blockquote
            className="tiktok-embed"
            cite={`https://www.tiktok.com/${handle}/video/${videoId}`}
            data-video-id={videoId}
            style={{ margin: 0 }}
          >
            <section>
              <a
                target="_blank"
                rel="noopener noreferrer"
                title={handle}
                href={`https://www.tiktok.com/${handle}/video/${videoId}`}
              >
                {handle}
              </a>
            </section>
          </blockquote>
        ) : (
          <div className="aspect-[9/16] relative overflow-hidden">
            <Image
              src={thumbnail}
              alt={title}
              fill
              sizes="(max-width: 768px) 50vw, 33vw"
              className="object-cover"
            />

            {/* Play button overlay */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="p-4 rounded-full bg-fill/20 backdrop-blur-sm">
                <HiPlay className="h-8 w-8 text-surface" />
              </div>
            </div>

            {/* Platform badge */}
            <div
              className={`absolute top-3 left-3 p-2 rounded-full bg-gradient-to-r ${color}`}
            >
              <PlatformIcon className="h-4 w-4 text-surface" />
            </div>

            {/* View count */}
            <HStack className="absolute bottom-3 left-3 items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm">
              <HiEye className="h-4 w-4 text-surface" />
              <Text className="text-sm font-semibold text-surface">
                {metric}
              </Text>
            </HStack>
          </div>
        )}

        {/* Info */}
        <VStack className="p-4">
          <Heading size="md" className="font-semibold mb-1 truncate">
            {title}
          </Heading>
          <HStack className="items-center justify-between text-sm text-foreground/60">
            <Text>{creator}</Text>
            <Text className="text-xs">{name}</Text>
          </HStack>
        </VStack>
      </Card>
    </div>
  );
}

export default function ResultsShowcase(): React.ReactElement {
  const { ref, isIntersecting } = useIntersectionObserver<HTMLElement>({
    threshold: 0.1,
    triggerOnce: true,
  });

  return (
    <section ref={ref} className="py-20 bg-background/50">
      <div className="container mx-auto px-4 md:px-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <VStack className="text-center mb-12 items-center">
            <HStack className="inline-flex items-center gap-2 mb-4">
              <HiHeart className="h-6 w-6 text-primary" />
              <Text className="text-sm font-semibold uppercase tracking-wide text-primary">
                Creator Results
              </Text>
            </HStack>
            <Heading
              size="2xl"
              className="text-3xl sm:text-4xl font-serif italic mb-4"
            >
              From Idea to Millions of Views
            </Heading>
            <Text
              as="p"
              className="text-lg text-foreground/70 max-w-2xl mx-auto"
            >
              Real creators, real results. See what&apos;s possible when you
              have AI-powered content tools.
            </Text>
          </VStack>

          {/* Results Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {isIntersecting &&
              RESULTS.map((result, index) => (
                <ResultCard key={index} {...result} delay={index * 100} />
              ))}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-12">
            {STATS.map((stat) => (
              <AnimatedStat key={stat.label} {...stat} />
            ))}
          </div>

          {/* Attribution */}
          <Text
            as="p"
            className="text-sm text-muted-foreground text-center mt-8"
          >
            Featuring AI-generated content from TikTok creators
          </Text>
        </div>
      </div>
    </section>
  );
}
