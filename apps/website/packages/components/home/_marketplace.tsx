'use client';

import { ButtonSize, CardVariant } from '@genfeedai/enums';
import { useDelayedVisibility } from '@hooks/ui/use-delayed-visibility';
import { useIntersectionObserver } from '@hooks/ui/use-intersection-observer/use-intersection-observer';
import { EnvironmentService } from '@services/core/environment.service';
import Card from '@ui/card/Card';
import { HStack, VStack } from '@ui/layout/stack';
import { Button } from '@ui/primitives/button';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { FaInstagram, FaTiktok, FaYoutube } from 'react-icons/fa6';
import {
  HiArrowPath,
  HiArrowRight,
  HiPhoto,
  HiPuzzlePiece,
  HiShoppingBag,
  HiSparkles,
  HiVideoCamera,
} from 'react-icons/hi2';

interface TemplateCardProps {
  gradient: string;
  icon: React.ReactNode;
  title: string;
  category: string;
  price: string | null;
  delay: number;
}

function TemplateCard({
  gradient,
  icon,
  title,
  category,
  price,
  delay,
}: TemplateCardProps) {
  const visible = useDelayedVisibility({ delay });

  return (
    <Card
      variant={CardVariant.DEFAULT}
      className={`node-card group relative overflow-hidden p-0 transition-all duration-500 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
    >
      {/* Preview area */}
      <div
        className={`aspect-[4/3] bg-gradient-to-br ${gradient} relative overflow-hidden`}
      >
        {/* Grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px]" />

        {/* Center icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="p-4 bg-black/20 backdrop-blur-sm group-hover:scale-110 transition-transform duration-300">
            {icon}
          </div>
        </div>

        {/* Category badge */}
        <div className="absolute top-3 left-3">
          <div className="px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-sm text-surface text-xs font-medium">
            {category}
          </div>
        </div>

        {/* Price badge */}
        <div className="absolute top-3 right-3">
          <div
            className={`px-2.5 py-1 rounded-full backdrop-blur-sm text-xs font-medium ${
              price
                ? 'bg-primary/80 text-primary-foreground'
                : 'bg-green-500/80 text-surface'
            }`}
          >
            {price ?? 'Free'}
          </div>
        </div>
      </div>

      {/* Info */}
      <VStack className="p-4">
        <Heading
          as="h3"
          className="font-semibold mb-1 group-hover:text-primary transition-colors"
        >
          {title}
        </Heading>
        <HStack className="items-center gap-2 text-xs text-foreground/50">
          <HiSparkles className="h-3 w-3" />
          <Text>AI-powered template</Text>
        </HStack>
      </VStack>
    </Card>
  );
}

interface IntegrationBadgeProps {
  icon: React.ReactNode;
  name: string;
  delay: number;
}

function IntegrationBadge({ icon, name, delay }: IntegrationBadgeProps) {
  const visible = useDelayedVisibility({ delay });

  return (
    <Card
      variant={CardVariant.DEFAULT}
      className={`flex items-center gap-3 px-4 py-3 transition-all duration-500 ${
        visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
      }`}
    >
      {icon}
      <Text className="font-medium">{name}</Text>
    </Card>
  );
}

const TEMPLATES = [
  {
    category: 'Video',
    delay: 100,
    gradient: 'from-red-500/40 via-orange-500/40 to-yellow-500/40',
    icon: <FaYoutube className="h-10 w-10 text-surface" />,
    price: '$29',
    title: 'YouTube Shorts Pack',
  },
  {
    category: 'Video',
    delay: 200,
    gradient: 'from-purple-500/40 via-pink-500/40 to-rose-500/40',
    icon: <FaTiktok className="h-10 w-10 text-surface" />,
    price: null,
    title: 'TikTok Viral Kit',
  },
  {
    category: 'Image',
    delay: 300,
    gradient: 'from-blue-500/40 via-cyan-500/40 to-teal-500/40',
    icon: <HiPhoto className="h-10 w-10 text-surface" />,
    price: '$19',
    title: 'Product Photography',
  },
  {
    category: 'Video',
    delay: 400,
    gradient: 'from-indigo-500/40 via-violet-500/40 to-purple-500/40',
    icon: <FaInstagram className="h-10 w-10 text-surface" />,
    price: null,
    title: 'Instagram Reels',
  },
  {
    category: 'Workflow',
    delay: 500,
    gradient: 'from-emerald-500/40 via-green-500/40 to-lime-500/40',
    icon: <HiArrowPath className="h-10 w-10 text-surface" />,
    price: '$49',
    title: 'Content Calendar',
  },
  {
    category: 'Image',
    delay: 600,
    gradient: 'from-amber-500/40 via-yellow-500/40 to-orange-500/40',
    icon: <HiVideoCamera className="h-10 w-10 text-surface" />,
    price: null,
    title: 'Thumbnail Generator',
  },
] as const;

const INTEGRATIONS = [
  {
    delay: 700,
    icon: <FaYoutube className="h-6 w-6 text-red-500" />,
    name: 'YouTube',
  },
  { delay: 800, icon: <FaTiktok className="h-6 w-6" />, name: 'TikTok' },
  {
    delay: 900,
    icon: <FaInstagram className="h-6 w-6 text-pink-500" />,
    name: 'Instagram',
  },
] as const;

export default function Marketplace() {
  const { ref, isIntersecting } = useIntersectionObserver<HTMLElement>({
    threshold: 0.15,
    triggerOnce: true,
  });

  return (
    <section ref={ref} className="py-20 bg-muted/30 overflow-hidden">
      <div className="container mx-auto px-4 md:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <VStack className="text-center mb-12">
            <HStack className="inline-flex items-center gap-2 mb-4">
              <HiShoppingBag className="h-6 w-6 text-primary" />
              <Text className="text-sm font-semibold uppercase tracking-wide text-primary">
                Marketplace
              </Text>
            </HStack>
            <Heading as="h2" className="text-3xl sm:text-4xl font-bold mb-4">
              Templates,{' '}
              <Text as="span" className="font-serif italic">
                Workflows
              </Text>{' '}
              & More
            </Heading>
            <Text
              as="p"
              className="text-lg text-foreground/70 max-w-2xl mx-auto"
            >
              Pre-built templates and automation workflows to supercharge your
              content creation.
            </Text>
          </VStack>

          {/* Templates Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-12">
            {isIntersecting &&
              TEMPLATES.map((template) => (
                <TemplateCard key={template.title} {...template} />
              ))}
          </div>

          {/* Integrations */}
          <div className="flex flex-col items-center gap-6">
            <HStack className="items-center gap-2 text-foreground/60">
              <HiPuzzlePiece className="h-5 w-5" />
              <Text className="text-sm font-medium">
                Connects with your favorite platforms
              </Text>
            </HStack>
            <div className="flex flex-wrap justify-center gap-4">
              {isIntersecting &&
                INTEGRATIONS.map((integration) => (
                  <IntegrationBadge key={integration.name} {...integration} />
                ))}
            </div>
          </div>

          {/* CTA */}
          <div className="text-center mt-12">
            <Button asChild size={ButtonSize.LG}>
              <a href={EnvironmentService.apps.marketplace}>
                Browse Marketplace
                <HiArrowRight className="h-5 w-5" />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
