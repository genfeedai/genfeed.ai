'use client';

import { useDelayedVisibility } from '@hooks/ui/use-delayed-visibility';
import { useIntersectionObserver } from '@hooks/ui/use-intersection-observer/use-intersection-observer';
import { HStack, VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import Image from 'next/image';
import {
  HiEye,
  HiHeart,
  HiPhoto,
  HiPlay,
  HiSparkles,
  HiVideoCamera,
} from 'react-icons/hi2';

interface DemoCardProps {
  category: string;
  delay: number;
  gradient: string;
  likes: string;
  thumbnailUrl?: string;
  title: string;
  type: 'video' | 'image';
  videoId?: string;
  videoUsername?: string;
  views: string;
}

const DEMO_TYPE_CONFIG = {
  image: { centerIcon: HiPhoto, label: 'AI Image', typeIcon: HiPhoto },
  video: { centerIcon: HiPlay, label: 'AI Video', typeIcon: HiVideoCamera },
} as const;

function DemoCard({
  category,
  delay,
  gradient,
  likes,
  thumbnailUrl,
  title,
  type,
  videoId,
  videoUsername,
  views,
}: DemoCardProps) {
  const visible = useDelayedVisibility({ delay });
  const {
    centerIcon: CenterIcon,
    label: typeLabel,
    typeIcon: TypeIcon,
  } = DEMO_TYPE_CONFIG[type];

  return (
    <div
      className={`group relative overflow-hidden transition-all duration-700 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
    >
      {videoId && videoUsername ? (
        <blockquote
          className="tiktok-embed"
          cite={`https://www.tiktok.com/@${videoUsername}/video/${videoId}`}
          data-video-id={videoId}
          style={{ margin: 0 }}
        >
          <section>
            <a
              target="_blank"
              rel="noopener noreferrer"
              title={`@${videoUsername}`}
              href={`https://www.tiktok.com/@${videoUsername}/video/${videoId}`}
            >
              @{videoUsername}
            </a>
          </section>
        </blockquote>
      ) : (
        <>
          {/* Thumbnail or gradient background */}
          <div
            className={`aspect-[9/16] sm:aspect-[3/4] relative overflow-hidden ${!thumbnailUrl ? `bg-gradient-to-br ${gradient}` : ''}`}
          >
            {thumbnailUrl && (
              <Image
                src={thumbnailUrl}
                alt={title}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 16vw"
                className="object-cover"
              />
            )}

            {/* Animated shimmer effect */}
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />

            {/* Grid pattern overlay - only show on gradient */}
            {!thumbnailUrl && (
              <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px]" />
            )}

            {/* Center icon */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="scale-100 rounded-full bg-black/30 p-4 backdrop-blur-sm transition-all duration-300 group-hover:scale-110">
                <CenterIcon className="h-8 w-8 text-surface" />
              </div>
            </div>

            {/* Type badge */}
            <div className="absolute top-3 left-3">
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-black/50 backdrop-blur-sm text-surface text-xs font-medium">
                <TypeIcon className="h-3 w-3" />
                {typeLabel}
              </div>
            </div>

            {/* AI badge */}
            <div className="absolute top-3 right-3">
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/80 backdrop-blur-sm text-primary-foreground text-xs font-medium">
                <HiSparkles className="h-3 w-3" />
                AI
              </div>
            </div>

            {/* Floating particles when hovered */}
            <div className="absolute bottom-1/4 left-1/4 h-2 w-2 rounded-full bg-fill/30 opacity-0 transition-opacity group-hover:opacity-100 animate-ping" />
            <div className="absolute top-1/3 right-1/3 h-1.5 w-1.5 rounded-full bg-fill/20 opacity-0 transition-opacity group-hover:opacity-100 animate-ping animation-delay-200" />
            <div className="absolute bottom-1/3 right-1/4 h-1 w-1 rounded-full bg-fill/40 opacity-0 transition-opacity group-hover:opacity-100 animate-ping animation-delay-400" />
          </div>

          {/* Card info */}
          <div className="p-4 bg-card/80 backdrop-blur-sm border-t border-edge/[0.08]">
            <div className="text-xs text-primary font-medium mb-1">
              {category}
            </div>
            <Heading
              as="h3"
              className="font-semibold text-sm mb-2 line-clamp-1"
            >
              {title}
            </Heading>
            <HStack className="items-center gap-4 text-xs text-foreground/60">
              <Text className="flex items-center gap-1">
                <HiEye className="h-3 w-3" />
                {views}
              </Text>
              <Text className="flex items-center gap-1">
                <HiHeart className="h-3 w-3" />
                {likes}
              </Text>
            </HStack>
          </div>
        </>
      )}
    </div>
  );
}

function GeneratingIndicator() {
  return (
    <div className="aspect-[9/16] sm:aspect-[3/4] bg-card/50 border border-dashed border-primary/30 flex flex-col items-center justify-center gap-4 p-6">
      <div className="relative">
        <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" />
        <div className="relative p-4 bg-card border border-primary/30">
          <HiSparkles className="h-8 w-8 text-primary animate-pulse" />
        </div>
      </div>
      <VStack className="text-center">
        <HStack className="items-center gap-2 justify-center mb-2">
          <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" />
          <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce animation-delay-100" />
          <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce animation-delay-200" />
        </HStack>
        <Text as="p" className="text-sm text-foreground/60">
          Generating...
        </Text>
      </VStack>
    </div>
  );
}

const DEMO_CONTENT: DemoCardProps[] = [
  {
    category: 'AI Video',
    delay: 100,
    gradient: 'from-purple-600 via-pink-500 to-red-500',
    likes: '24K',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400&q=80&fit=crop',
    title: 'Sora Style Transform',
    type: 'video',
    views: '2.4M',
  },
  {
    category: 'AI Video',
    delay: 200,
    gradient: 'from-blue-600 via-cyan-500 to-teal-500',
    likes: '18K',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=400&q=80&fit=crop',
    title: 'Snowy Tokyo Scene',
    type: 'video',
    views: '1.8M',
  },
  {
    category: 'AI Video',
    delay: 300,
    gradient: 'from-orange-500 via-amber-500 to-yellow-500',
    likes: '32K',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&q=80&fit=crop',
    title: 'AI Videos Are Wild',
    type: 'video',
    views: '3.2M',
  },
  {
    category: 'AI Video',
    delay: 400,
    gradient: 'from-green-500 via-emerald-500 to-teal-500',
    likes: '8.9K',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1474511320723-9a56873571b7?w=400&q=80&fit=crop',
    title: 'AI For Humans Show',
    type: 'video',
    views: '890K',
  },
  {
    category: 'AI Video',
    delay: 500,
    gradient: 'from-indigo-600 via-purple-500 to-pink-500',
    likes: '75K',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80&fit=crop',
    title: 'Top 5 Realistic AI',
    type: 'video',
    views: '7.5M',
  },
];

export default function DemoShowcase() {
  const { ref, isIntersecting } = useIntersectionObserver<HTMLElement>({
    threshold: 0.2,
    triggerOnce: true,
  });

  return (
    <section ref={ref} className="py-20 bg-background/30">
      <div className="container mx-auto px-4 md:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <VStack className="text-center mb-12">
            <HStack className="inline-flex items-center gap-2 mb-4">
              <HiSparkles className="h-6 w-6 text-primary" />
              <Text className="text-sm font-semibold uppercase tracking-wide text-primary">
                AI Generated Content
              </Text>
            </HStack>
            <Heading
              as="h2"
              className="text-3xl sm:text-4xl font-serif italic mb-4"
            >
              See What&apos;s Possible
            </Heading>
            <Text
              as="p"
              className="text-lg text-foreground/70 max-w-2xl mx-auto"
            >
              Real examples of AI-generated videos and images. Create content
              like this in minutes.
            </Text>
          </VStack>

          {/* Demo Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {isIntersecting &&
              DEMO_CONTENT.map((item) => (
                <DemoCard key={item.title} {...item} />
              ))}
            {isIntersecting && <GeneratingIndicator />}
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
