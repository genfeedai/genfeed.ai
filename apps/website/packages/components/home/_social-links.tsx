import { EnvironmentService } from '@services/core/environment.service';
import Card from '@ui/card/Card';
import { VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { FaDiscord, FaInstagram, FaXTwitter } from 'react-icons/fa6';
import { HiBookOpen, HiMap, HiServer } from 'react-icons/hi2';

export default function SocialLinks() {
  const socials = [
    {
      color: 'hover:text-platform-discord',
      description: 'Join our community',
      href: EnvironmentService.social.discord,
      icon: <FaDiscord className="text-5xl" />,
      name: 'Discord',
    },
    {
      color: 'hover:text-platform-twitter',
      description: 'Follow for updates',
      href: EnvironmentService.social.twitter,
      icon: <FaXTwitter className="text-5xl" />,
      name: 'X (Twitter)',
    },
    {
      color: 'hover:text-platform-instagram',
      description: 'See the results',
      href: EnvironmentService.social.instagram,
      icon: <FaInstagram className="text-5xl" />,
      name: 'Instagram',
    },
    {
      color: 'hover:text-primary',
      description: 'Learn how to use',
      href: 'https://docs.genfeed.ai',
      icon: <HiBookOpen className="text-5xl" />,
      name: 'Documentation',
    },
    {
      color: 'hover:text-success',
      description: 'System status & uptime',
      href: 'https://genfeed.statuspage.io',
      icon: <HiServer className="text-5xl" />,
      name: 'Status',
    },
    {
      color: 'hover:text-warning',
      description: 'Feature requests & votes',
      href: 'https://genfeedai.canny.io',
      icon: <HiMap className="text-5xl" />,
      name: 'Roadmap',
    },
  ];

  return (
    <div className="py-20">
      <div className="container mx-auto px-4 md:px-8">
        <VStack className="text-center mb-12">
          <Heading size="2xl" className="text-4xl font-bold mb-4">
            Join the Community
          </Heading>
          <Text as="p" className="text-xl text-foreground/70 max-w-3xl mx-auto">
            Connect with creators, share your results, and stay updated
          </Text>
        </VStack>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {socials.map((social) => (
            <a
              key={social.name}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`${social.color} group`}
            >
              <Card
                className="bg-background hover:bg-muted transition-all h-full"
                bodyClassName="items-center text-center"
                label={social.name}
                description={social.description}
              >
                <div className="mb-3 transition-transform group-hover:scale-110">
                  {social.icon}
                </div>
              </Card>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
