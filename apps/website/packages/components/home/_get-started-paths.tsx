import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { HStack, VStack } from '@ui/layout/stack';
import { Button } from '@ui/primitives/button';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import Link from 'next/link';
import { HiCloud, HiMap, HiServerStack } from 'react-icons/hi2';
import { LuCheck } from 'react-icons/lu';

const paths = [
  {
    cta: 'View Setup Guide',
    ctaHref: '/host',
    features: [
      'Full source code access',
      'Deploy on your infrastructure',
      'All core features included',
      'Community support',
      'Bring your own AI API keys',
    ],
    highlight: false,
    icon: HiServerStack,
    subtitle: 'Free Forever',
    title: 'Self-Hosted',
  },
  {
    cta: 'View Plans',
    ctaHref: '/pricing',
    features: [
      'No infrastructure to manage',
      'Automatic updates & scaling',
      '$49/month platform access',
      'Pay-as-you-go output',
      'Premium AI models',
      'Upgrade to Cloud for teams and brands',
    ],
    highlight: true,
    icon: HiCloud,
    subtitle: '$49/mo + PAYG output',
    title: 'Hosted',
  },
];

export default function HomeGetStartedPaths() {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4 md:px-8">
        <div className="max-w-5xl mx-auto">
          <VStack className="text-center mb-12">
            <HStack className="inline-flex items-center gap-2 mb-4">
              <HiMap className="h-6 w-6 gen-icon" />
              <Text className="gen-label gen-text-accent">
                Deployment Options
              </Text>
            </HStack>
            <Heading as="h2" className="text-3xl sm:text-4xl font-bold mb-4">
              Choose Your Path
            </Heading>
            <Text as="p" className="text-lg text-surface/60 max-w-2xl mx-auto">
              Self-host for complete control or use our managed cloud for hosted
              access and team collaboration.
            </Text>
          </VStack>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-edge/5">
            {paths.map((path) => {
              const Icon = path.icon;

              return (
                <div
                  key={path.title}
                  className={cn(
                    'relative flex flex-col bg-background p-8',
                    path.highlight && 'bg-white/[0.04]',
                  )}
                >
                  <HStack className="items-center gap-3 mb-2">
                    <Icon className="h-5 w-5 text-surface/50" />
                    <Heading as="h3" className="text-2xl font-bold">
                      {path.title}
                    </Heading>
                  </HStack>

                  <Text as="p" className="text-sm mb-6 text-surface/45">
                    {path.subtitle}
                  </Text>

                  <ul className="space-y-3 mb-8">
                    {path.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <LuCheck className="h-4 w-4 mt-0.5 shrink-0 text-surface/30" />
                        <Text className="text-sm text-surface/60">
                          {feature}
                        </Text>
                      </li>
                    ))}
                  </ul>

                  <Button
                    asChild
                    variant={ButtonVariant.OUTLINE}
                    size={ButtonSize.PUBLIC}
                    className="mt-auto w-full justify-center"
                  >
                    <Link href={path.ctaHref}>{path.cta}</Link>
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
