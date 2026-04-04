'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useIntersectionObserver } from '@hooks/ui/use-intersection-observer/use-intersection-observer';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { HStack } from '@ui/layout/stack';
import { Button } from '@ui/primitives/button';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { HiSparkles } from 'react-icons/hi2';
import { LuArrowRight } from 'react-icons/lu';

interface IShowcaseImage {
  id: number;
  title: string;
  model: string;
  aspect: 'portrait' | 'landscape' | 'square';
  image: string;
}

const SHOWCASE_IMAGES: IShowcaseImage[] = [
  {
    aspect: 'portrait',
    id: 1,
    image:
      'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=600&h=900&fit=crop',
    model: 'Flux',
    title: 'AI Portrait',
  },
  {
    aspect: 'landscape',
    id: 2,
    image:
      'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=900&h=450&fit=crop',
    model: 'SDXL',
    title: 'Urban Scene',
  },
  {
    aspect: 'square',
    id: 3,
    image:
      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop',
    model: 'Flux',
    title: 'Product Shot',
  },
  {
    aspect: 'portrait',
    id: 4,
    image:
      'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=600&h=900&fit=crop',
    model: 'GPT Image',
    title: 'Fashion Edit',
  },
  {
    aspect: 'landscape',
    id: 5,
    image:
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=900&h=450&fit=crop',
    model: 'Kling',
    title: 'Motion Clip',
  },
  {
    aspect: 'square',
    id: 6,
    image:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&h=600&fit=crop',
    model: 'Nano',
    title: 'Beauty Shot',
  },
  {
    aspect: 'portrait',
    id: 7,
    image:
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&h=900&fit=crop',
    model: 'SDXL',
    title: 'Editorial',
  },
  {
    aspect: 'landscape',
    id: 8,
    image:
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=900&h=450&fit=crop',
    model: 'Flux',
    title: 'Glamour',
  },
  {
    aspect: 'square',
    id: 9,
    image:
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&h=600&fit=crop',
    model: 'GPT Image',
    title: 'Studio Light',
  },
  {
    aspect: 'portrait',
    id: 10,
    image:
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&h=900&fit=crop',
    model: 'Flux',
    title: 'Golden Hour',
  },
  {
    aspect: 'landscape',
    id: 11,
    image:
      'https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=900&h=450&fit=crop',
    model: 'SDXL',
    title: 'Cinematic',
  },
  {
    aspect: 'square',
    id: 12,
    image:
      'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=600&h=600&fit=crop',
    model: 'Nano',
    title: 'Neon Portrait',
  },
];

const MODEL_TABS = [
  'All',
  'Flux',
  'SDXL',
  'Kling',
  'Nano',
  'GPT Image',
] as const;

const ASPECT_SPANS: Record<string, string> = {
  landscape: 'col-span-2',
  portrait: 'row-span-2',
  square: '',
};

const GRADIENT_PALETTES = [
  'from-amber-900/40 to-stone-900/60',
  'from-stone-800/50 to-neutral-900/60',
  'from-zinc-800/40 to-stone-900/50',
  'from-neutral-800/50 to-amber-950/30',
  'from-stone-900/60 to-zinc-800/40',
  'from-amber-950/30 to-stone-800/50',
];

export default function HomeShowcase(): React.ReactElement {
  const [activeTab, setActiveTab] = useState('All');
  const { ref, isIntersecting } = useIntersectionObserver<HTMLElement>({
    threshold: 0.1,
    triggerOnce: true,
  });

  const filteredImages =
    activeTab === 'All'
      ? SHOWCASE_IMAGES
      : SHOWCASE_IMAGES.filter((img) => img.model === activeTab);

  return (
    <section ref={ref} className="gen-section-spacing-lg">
      <div className="container mx-auto px-6">
        {/* Section header */}
        <HStack className="items-center justify-between mb-8">
          <HStack className="items-center gap-3">
            <Text className="gen-label gen-text-accent">AI Gallery</Text>
            <Text className="text-xs text-surface/30">
              {filteredImages.length} Results
            </Text>
          </HStack>
        </HStack>

        {/* Model tabs */}
        <HStack className="flex-wrap gap-0 mb-8">
          {MODEL_TABS.map((tab) => (
            <Button
              key={tab}
              variant={ButtonVariant.UNSTYLED}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all border gen-border',
                activeTab === tab
                  ? 'gen-tab-active'
                  : 'bg-transparent text-surface/40 hover:text-surface/60 hover:bg-fill/[0.03]',
              )}
            >
              {tab}
            </Button>
          ))}
        </HStack>

        {/* Masonry grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 grid-flow-dense auto-rows-[200px] gap-1.5 mb-1.5">
          {isIntersecting &&
            filteredImages.map((image, index) => (
              <div
                key={image.id}
                className={cn(
                  'gen-contact-sheet relative overflow-hidden group',
                  'animate-gen-stagger-in',
                  ASPECT_SPANS[image.aspect],
                )}
                style={{ animationDelay: `${index * 60}ms` }}
              >
                {/* Image with noir gradient overlay */}
                <Image
                  src={image.image}
                  alt={image.title}
                  width={image.aspect === 'landscape' ? 900 : 600}
                  height={
                    image.aspect === 'portrait'
                      ? 900
                      : image.aspect === 'landscape'
                        ? 450
                        : 600
                  }
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="absolute inset-0 h-full w-full object-cover object-center"
                />
                <div
                  className={cn(
                    'absolute inset-0 bg-gradient-to-br opacity-60',
                    GRADIENT_PALETTES[index % GRADIENT_PALETTES.length],
                  )}
                />

                {/* Model label */}
                <div className="absolute top-3 left-3 z-10">
                  <Text className="text-[9px] font-bold uppercase tracking-widest gen-text-accent">
                    {image.model}
                  </Text>
                </div>

                {/* Frame number */}
                <div className="absolute bottom-3 right-3 z-10">
                  <Text className="text-[9px] font-mono text-surface/20">
                    {String(image.id).padStart(2, '0')}
                  </Text>
                </div>

                {/* Title on hover */}
                <div className="absolute bottom-3 left-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <Text className="text-xs font-medium text-surface/60">
                    {image.title}
                  </Text>
                </div>
              </div>
            ))}
        </div>

        {/* Bottom bar */}
        <div className="gen-card-featured px-6 py-4">
          <HStack className="items-center justify-between">
            <HStack className="items-center gap-3">
              <HiSparkles className="h-4 w-4 text-inv-fg" />
              <Heading
                as="h3"
                className="text-sm font-black text-inv-fg uppercase tracking-wider"
              >
                One prompt. Every model. Every format.
              </Heading>
            </HStack>
            <ButtonTracked
              asChild
              variant={ButtonVariant.BLACK}
              size={ButtonSize.DEFAULT}
              trackingName="showcase_cta_click"
              trackingData={{ action: 'core_cta' }}
            >
              <Link href="/core">
                Self-Host Free
                <LuArrowRight className="h-3 w-3" />
              </Link>
            </ButtonTracked>
          </HStack>
        </div>
      </div>
    </section>
  );
}
