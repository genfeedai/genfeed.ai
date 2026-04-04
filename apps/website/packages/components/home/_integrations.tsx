import Card from '@ui/card/Card';
import { VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { FaInstagram, FaTiktok, FaYoutube } from 'react-icons/fa6';

export default function HomeIntegrations() {
  const integrations = [
    {
      description:
        'Publish AI-generated videos directly to YouTube Shorts. Track views and revenue in one dashboard.',
      icon: <FaYoutube className="text-platform-youtube" />,
      name: 'YouTube',
    },
    {
      description:
        'Create trending content and schedule posts to maximize engagement on TikTok.',
      icon: <FaTiktok className="text-platform-tiktok" />,
      name: 'TikTok',
    },
    {
      description:
        'Publish Reels and Stories directly to Instagram. No copy-paste required.',
      icon: <FaInstagram className="text-platform-instagram" />,
      name: 'Instagram',
    },
  ];

  return (
    <div id="integrations" className="py-30">
      <div className="container mx-auto px-4 md:px-8">
        <VStack className="max-w-4xl mx-auto text-center mb-12">
          <Heading
            size="2xl"
            className="text-3xl sm:text-4xl font-bold mb-6 text-primary capitalize"
          >
            Publish to Instagram, TikTok, YouTube
          </Heading>
          <Text as="p" className="text-lg text-muted-foreground">
            Connect Instagram, TikTok, YouTube, and LinkedIn accounts in 2
            clicks
          </Text>
        </VStack>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {integrations.map((integration) => (
            <Card key={integration.name}>
              <div className="flex items-center justify-center py-10 text-8xl">
                {integration.icon}
              </div>

              <Heading size="lg" className="text-xl font-bold text-center mb-2">
                {integration.name}
              </Heading>

              <Text as="p" className="text-muted-foreground text-center">
                {integration.description}
              </Text>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
