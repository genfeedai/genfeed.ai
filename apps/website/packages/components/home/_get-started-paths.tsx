import { ButtonVariant } from '@genfeedai/enums';
import Card from '@ui/card/Card';
import { HStack, VStack } from '@ui/layout/stack';
import AppLink from '@ui/navigation/link/Link';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { HiCheck, HiCloud, HiMap, HiServerStack } from 'react-icons/hi2';

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
      'Premium AI models (auto-selected)',
      '30 videos + 500 images/month',
      'Priority support & API access',
    ],
    highlight: true,
    icon: HiCloud,
    subtitle: 'Starting at $499/month',
    title: 'Managed Cloud',
  },
];

export default function HomeGetStartedPaths() {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4 md:px-8">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <VStack className="text-center mb-12">
            <HStack className="inline-flex items-center gap-2 mb-4">
              <HiMap className="h-6 w-6 text-primary" />
              <Text className="text-sm font-semibold uppercase tracking-wide text-primary">
                Deployment Options
              </Text>
            </HStack>
            <Heading as="h2" className="text-3xl sm:text-4xl font-bold mb-4">
              Choose Your Path
            </Heading>
            <Text
              as="p"
              className="text-lg text-foreground/70 max-w-2xl mx-auto"
            >
              Self-host for complete control or use our managed cloud for
              hassle-free content generation.
            </Text>
          </VStack>

          {/* Two Column Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {paths.map((path) => {
              const Icon = path.icon;
              const highlightStyles = {
                checkIcon: path.highlight
                  ? 'text-primary-foreground'
                  : 'text-primary',
                featureText: path.highlight
                  ? 'text-primary-foreground/90'
                  : 'text-foreground/80',
                subtitle: path.highlight
                  ? 'text-primary-foreground/80'
                  : 'text-foreground/60',
              };

              return (
                <Card
                  key={path.title}
                  className={`relative p-8 ${path.highlight ? 'bg-primary text-primary-foreground' : ''}`}
                >
                  {path.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Text className="bg-secondary text-secondary-content text-xs font-semibold px-3 py-1 rounded-full uppercase">
                        Popular
                      </Text>
                    </div>
                  )}

                  <HStack className="items-center gap-3 mb-2">
                    <Icon className="h-6 w-6" />
                    <Heading as="h3" className="text-2xl font-bold">
                      {path.title}
                    </Heading>
                  </HStack>

                  <Text
                    as="p"
                    className={`text-sm mb-6 ${highlightStyles.subtitle}`}
                  >
                    {path.subtitle}
                  </Text>

                  <ul className="space-y-3 mb-8">
                    {path.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <HiCheck
                          className={`h-5 w-5 mt-0.5 flex-shrink-0 ${highlightStyles.checkIcon}`}
                        />
                        <Text className={highlightStyles.featureText}>
                          {feature}
                        </Text>
                      </li>
                    ))}
                  </ul>

                  <AppLink
                    url={path.ctaHref}
                    label={path.cta}
                    variant={
                      path.highlight
                        ? ButtonVariant.SECONDARY
                        : ButtonVariant.DEFAULT
                    }
                    className="w-full rounded-full"
                  />
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
