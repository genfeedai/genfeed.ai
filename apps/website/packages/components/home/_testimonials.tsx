'use client';

import { HStack, VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { HiStar } from 'react-icons/hi2';

export default function HomeTestimonial(): React.ReactElement {
  return (
    <section className="gen-section-spacing-lg relative gen-spotlight-right overflow-hidden">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto relative">
          {/* Amber borders top and bottom */}
          <div className="gen-divider-accent mb-12" />

          <VStack className="items-center text-center gap-8">
            {/* Stars */}
            <HStack className="gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <HiStar key={star} className="h-5 w-5 gen-icon" />
              ))}
            </HStack>

            {/* Quote */}
            <Heading
              as="blockquote"
              className="text-2xl sm:text-3xl md:text-4xl font-serif italic leading-relaxed text-surface/80 animate-gen-flicker"
            >
              &ldquo;Genfeed replaced our entire content pipeline. What took a
              team of 5 now takes one person and a prompt.&rdquo;
            </Heading>

            {/* Attribution */}
            <VStack className="items-center gap-1">
              <Text className="font-black text-xs uppercase tracking-widest gen-text-accent">
                Sarah Chen
              </Text>
              <Text className="text-[10px] text-surface/30 uppercase tracking-widest">
                Head of Content
              </Text>
            </VStack>
          </VStack>

          <div className="gen-divider-accent mt-12" />
        </div>
      </div>
    </section>
  );
}
