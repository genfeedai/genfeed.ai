'use client';

import { useAuth } from '@clerk/nextjs';
import {
  ButtonSize,
  ButtonVariant,
  CredentialPlatform,
} from '@genfeedai/enums';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import type { BrandDetailSocialMediaCardProps } from '@props/pages/brand-detail.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { ServicesService } from '@services/external/services.service';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import SocialMediaLink from '@ui/media/social-media-link/SocialMediaLink';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  FaFacebook,
  FaInstagram,
  FaLinkedin,
  FaMastodon,
  FaPinterest,
  FaReddit,
  FaShopify,
  FaSnapchat,
  FaStar,
  FaThreads,
  FaTiktok,
  FaWordpress,
  FaXTwitter,
  FaYoutube,
} from 'react-icons/fa6';

const platformIconMap: Partial<Record<CredentialPlatform, ReactNode>> = {
  [CredentialPlatform.YOUTUBE]: <FaYoutube />,
  [CredentialPlatform.TIKTOK]: <FaTiktok />,
  [CredentialPlatform.INSTAGRAM]: <FaInstagram />,
  [CredentialPlatform.TWITTER]: <FaXTwitter />,
  [CredentialPlatform.FANVUE]: <FaStar />,
  [CredentialPlatform.FACEBOOK]: <FaFacebook />,
  [CredentialPlatform.LINKEDIN]: <FaLinkedin />,
  [CredentialPlatform.PINTEREST]: <FaPinterest />,
  [CredentialPlatform.REDDIT]: <FaReddit />,
  [CredentialPlatform.THREADS]: <FaThreads />,
  [CredentialPlatform.WORDPRESS]: <FaWordpress />,
  [CredentialPlatform.SNAPCHAT]: <FaSnapchat />,
  [CredentialPlatform.MASTODON]: <FaMastodon />,
  [CredentialPlatform.SHOPIFY]: <FaShopify />,
};

const OAUTH_PLATFORMS = [
  {
    icon: <FaXTwitter className="mr-1.5 h-3.5 w-3.5" />,
    label: 'Twitter',
    platform: CredentialPlatform.TWITTER,
  },
  {
    icon: <FaTiktok className="mr-1.5 h-3.5 w-3.5" />,
    label: 'TikTok',
    platform: CredentialPlatform.TIKTOK,
  },
  {
    icon: <FaYoutube className="mr-1.5 h-3.5 w-3.5" />,
    label: 'YouTube',
    platform: CredentialPlatform.YOUTUBE,
  },
  {
    icon: <FaInstagram className="mr-1.5 h-3.5 w-3.5" />,
    label: 'Instagram',
    platform: CredentialPlatform.INSTAGRAM,
  },
  {
    icon: <FaStar className="mr-1.5 h-3.5 w-3.5" />,
    label: 'Fanvue',
    platform: CredentialPlatform.FANVUE,
  },
  {
    icon: <FaFacebook className="mr-1.5 h-3.5 w-3.5" />,
    label: 'Facebook',
    platform: CredentialPlatform.FACEBOOK,
  },
  {
    icon: <FaLinkedin className="mr-1.5 h-3.5 w-3.5" />,
    label: 'LinkedIn',
    platform: CredentialPlatform.LINKEDIN,
  },
  {
    icon: <FaPinterest className="mr-1.5 h-3.5 w-3.5" />,
    label: 'Pinterest',
    platform: CredentialPlatform.PINTEREST,
  },
  {
    icon: <FaReddit className="mr-1.5 h-3.5 w-3.5" />,
    label: 'Reddit',
    platform: CredentialPlatform.REDDIT,
  },
  {
    icon: <FaThreads className="mr-1.5 h-3.5 w-3.5" />,
    label: 'Threads',
    platform: CredentialPlatform.THREADS,
  },
  {
    icon: <FaWordpress className="mr-1.5 h-3.5 w-3.5" />,
    label: 'WordPress',
    platform: CredentialPlatform.WORDPRESS,
  },
  {
    icon: <FaSnapchat className="mr-1.5 h-3.5 w-3.5" />,
    label: 'Snapchat',
    platform: CredentialPlatform.SNAPCHAT,
  },
  {
    icon: <FaMastodon className="mr-1.5 h-3.5 w-3.5" />,
    label: 'Mastodon',
    platform: CredentialPlatform.MASTODON,
  },
  {
    icon: <FaShopify className="mr-1.5 h-3.5 w-3.5" />,
    label: 'Shopify',
    platform: CredentialPlatform.SHOPIFY,
  },
];

export default function BrandDetailSocialMediaCard({
  brandId,
  connections,
  connectedPlatformsCount,
}: BrandDetailSocialMediaCardProps) {
  const { getToken } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(
    null,
  );

  const connectedConnections = useMemo(
    () =>
      connections.filter(
        (connection) =>
          Boolean(connection.url) &&
          Boolean(platformIconMap[connection.platform]),
      ),
    [connections],
  );
  const connectedPlatforms = useMemo(
    () =>
      new Set(connectedConnections.map((connection) => connection.platform)),
    [connectedConnections],
  );

  const unconnectedPlatforms = useMemo(
    () => OAUTH_PLATFORMS.filter((p) => !connectedPlatforms.has(p.platform)),
    [connectedPlatforms],
  );

  const handleConnectPlatform = async (platform: string) => {
    try {
      setConnectingPlatform(platform);
      const token = (await resolveClerkToken(getToken)) ?? '';
      const service = new ServicesService(platform, token);
      const credentialOAuth = await service.postConnect({ brand: brandId });
      window.open(credentialOAuth.url, '_self');
    } catch (error) {
      logger.error(`Failed to initiate ${platform} OAuth:`, error);
      NotificationsService.getInstance().error(`Connect ${platform}`);
      setConnectingPlatform(null);
    }
  };

  const renderConnectButton = (item: (typeof OAUTH_PLATFORMS)[number]) => {
    return (
      <Button
        key={item.platform}
        variant={ButtonVariant.SECONDARY}
        size={ButtonSize.SM}
        onClick={() => handleConnectPlatform(item.platform)}
        isLoading={connectingPlatform === item.platform}
        isDisabled={connectingPlatform !== null}
      >
        {item.icon}
        {item.label}
      </Button>
    );
  };

  return (
    <>
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Social Media</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {connectedPlatformsCount > 0
                  ? `${connectedPlatformsCount} connected platform${connectedPlatformsCount === 1 ? '' : 's'} with ${unconnectedPlatforms.length} available to add.`
                  : 'Connect your social media accounts to display them here.'}
              </p>
            </div>

            <Button
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              onClick={() => setIsDialogOpen(true)}
            >
              {connectedPlatformsCount > 0 ? 'Manage' : 'Connect'}
            </Button>
          </div>

          {connectedConnections.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {connectedConnections.map((connection) => (
                <SocialMediaLink
                  key={connection.platform}
                  url={connection.url ?? ''}
                  handle={connection.handle || undefined}
                  icon={platformIconMap[connection.platform] ?? null}
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.SM}
                  enableUTM={false}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/70 bg-background/30 px-4 py-5 text-sm text-muted-foreground">
              No social accounts connected yet.
            </div>
          )}
        </div>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Social Media</DialogTitle>
            <DialogDescription>
              Connect channels for this brand and review the profiles that are
              already linked.
            </DialogDescription>
          </DialogHeader>

          {connectedPlatformsCount > 0 ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {connectedConnections.map((connection) => (
                  <SocialMediaLink
                    key={connection.platform}
                    url={connection.url ?? ''}
                    handle={connection.handle || undefined}
                    icon={platformIconMap[connection.platform] ?? null}
                    variant={ButtonVariant.SECONDARY}
                    size={ButtonSize.SM}
                    enableUTM={false}
                  />
                ))}
              </div>

              {unconnectedPlatforms.length > 0 ? (
                <div className="space-y-3 border-t border-border pt-4">
                  <p className="text-sm text-muted-foreground">
                    Add more channels for this brand.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {unconnectedPlatforms.map(renderConnectButton)}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Connect your social media accounts to display them here.
              </p>
              <div className="flex flex-wrap gap-2">
                {OAUTH_PLATFORMS.map(renderConnectButton)}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
