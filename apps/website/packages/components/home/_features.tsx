import { ButtonSize, ButtonVariant, CardVariant } from '@genfeedai/enums';
import Card from '@ui/card/Card';
import { VStack } from '@ui/layout/stack';
import { Button } from '@ui/primitives/button';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import Link from 'next/link';
import { HiArrowRight } from 'react-icons/hi2';
import { allFeatures } from './_features.helpers';

export default function FeaturesNew() {
  return (
    <div id="features" className="py-24 md:py-32 bg-dots-subtle">
      <div className="container mx-auto px-4 md:px-8">
        <VStack className="text-center mb-16">
          <Text className="text-[10px] font-black tracking-[0.2em] uppercase text-surface/60 mb-4 block">
            Features
          </Text>
          <Heading
            as="h2"
            className="text-4xl md:text-5xl font-serif-italic mb-4"
          >
            Everything You Need to Scale Content
          </Heading>
          <Text as="p" className="text-xl text-foreground/60 max-w-3xl mx-auto">
            AI tools that create videos, images, avatars, and articles at scale
          </Text>
        </VStack>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {allFeatures.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <Card
                key={feature.label}
                variant={CardVariant.DEFAULT}
                className="p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-glow-md)]"
                index={index}
              >
                <div className="flex items-center justify-center mb-6">
                  <div className="p-4 bg-fill/10">
                    <Icon className="size-8 text-surface" />
                  </div>
                </div>

                <Heading as="h3" className="text-xl font-bold text-center mb-3">
                  {feature.label}
                </Heading>

                <Text
                  as="p"
                  className="text-foreground/50 text-center text-sm leading-relaxed"
                >
                  {feature.description}
                </Text>
              </Card>
            );
          })}
        </div>

        <div className="text-center mt-16">
          <Button
            asChild
            variant={ButtonVariant.OUTLINE}
            size={ButtonSize.PUBLIC}
          >
            <Link href="/features">
              See all features
              <HiArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
