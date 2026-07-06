'use client';

import {
  ButtonSize,
  ButtonVariant,
  CredentialPlatform,
} from '@genfeedai/enums';
import type { AccountHealthSummary } from '@genfeedai/interfaces';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import type { BrandDetailSocialMediaCardProps } from '@props/pages/brand-detail.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { ServicesService } from '@services/external/services.service';
import { CredentialsService } from '@services/organization/credentials.service';
import Card from '@ui/card/Card';
import SocialMediaLink from '@ui/media/social-media-link/SocialMediaLink';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
    icon: <FaXTwitter className="mr-1.5 size-3.5" />,
    label: 'Twitter',
    platform: CredentialPlatform.TWITTER,
  },
  {
    icon: <FaTiktok className="mr-1.5 size-3.5" />,
    label: 'TikTok',
    platform: CredentialPlatform.TIKTOK,
  },
  {
    icon: <FaYoutube className="mr-1.5 size-3.5" />,
    label: 'YouTube',
    platform: CredentialPlatform.YOUTUBE,
  },
  {
    icon: <FaInstagram className="mr-1.5 size-3.5" />,
    label: 'Instagram',
    platform: CredentialPlatform.INSTAGRAM,
  },
  {
    icon: <FaStar className="mr-1.5 size-3.5" />,
    label: 'Fanvue',
    platform: CredentialPlatform.FANVUE,
  },
  {
    icon: <FaFacebook className="mr-1.5 size-3.5" />,
    label: 'Facebook',
    platform: CredentialPlatform.FACEBOOK,
  },
  {
    icon: <FaLinkedin className="mr-1.5 size-3.5" />,
    label: 'LinkedIn',
    platform: CredentialPlatform.LINKEDIN,
  },
  {
    icon: <FaPinterest className="mr-1.5 size-3.5" />,
    label: 'Pinterest',
    platform: CredentialPlatform.PINTEREST,
  },
  {
    icon: <FaReddit className="mr-1.5 size-3.5" />,
    label: 'Reddit',
    platform: CredentialPlatform.REDDIT,
  },
  {
    icon: <FaThreads className="mr-1.5 size-3.5" />,
    label: 'Threads',
    platform: CredentialPlatform.THREADS,
  },
  {
    icon: <FaWordpress className="mr-1.5 size-3.5" />,
    label: 'WordPress',
    platform: CredentialPlatform.WORDPRESS,
  },
  {
    icon: <FaSnapchat className="mr-1.5 size-3.5" />,
    label: 'Snapchat',
    platform: CredentialPlatform.SNAPCHAT,
  },
  {
    icon: <FaMastodon className="mr-1.5 size-3.5" />,
    label: 'Mastodon',
    platform: CredentialPlatform.MASTODON,
  },
  {
    icon: <FaShopify className="mr-1.5 size-3.5" />,
    label: 'Shopify',
    platform: CredentialPlatform.SHOPIFY,
  },
];

const STATE_LABELS: Record<AccountHealthSummary['state'], string> = {
  healthy: 'Healthy',
  not_started: 'Not started',
  risky: 'Risky',
  warming: 'Warming',
};

function getHealthToneClass(summary: AccountHealthSummary): string {
  if (summary.override.isActive) {
    return 'border-info/30 bg-info/10 text-info';
  }

  if (summary.holdPublishing || summary.riskLevel === 'high') {
    return 'border-warning/30 bg-warning/10 text-warning';
  }

  return 'border-success/30 bg-success/10 text-success';
}

function formatHealthDetail(summary: AccountHealthSummary): string {
  if (summary.override.isActive) {
    return 'Manual override active for this account.';
  }

  if (summary.holdPublishing) {
    return summary.holdReason ?? 'Scheduled publishing is held for warmup.';
  }

  return `${summary.signals.publishedPosts} published post${summary.signals.publishedPosts === 1 ? '' : 's'} across ${summary.signals.connectedDays} connected day${summary.signals.connectedDays === 1 ? '' : 's'}.`;
}

export default function BrandDetailSocialMediaCard({
  brandId,
  connections,
  connectedPlatformsCount,
}: BrandDetailSocialMediaCardProps) {
  const { getToken } = useAuthIdentity();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(
    null,
  );
  const [accountHealth, setAccountHealth] = useState<AccountHealthSummary[]>(
    [],
  );
  const [isHealthLoading, setIsHealthLoading] = useState(false);
  const [overrideCredentialId, setOverrideCredentialId] = useState<
    string | null
  >(null);
  const [isOverrideSubmitting, setIsOverrideSubmitting] = useState(false);

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
  const connectionHealth = useMemo(
    () =>
      connections
        .map((connection) => connection.accountHealth)
        .filter(
          (summary): summary is AccountHealthSummary => summary !== undefined,
        ),
    [connections],
  );
  const healthRows =
    accountHealth.length > 0 ? accountHealth : connectionHealth;
  const selectedOverrideHealth = useMemo(
    () =>
      healthRows.find(
        (summary) => summary.credentialId === overrideCredentialId,
      ) ?? null,
    [healthRows, overrideCredentialId],
  );

  const loadAccountHealth = useCallback(
    async (signal?: AbortSignal) => {
      if (!brandId || connectedPlatformsCount === 0) {
        setAccountHealth([]);
        return;
      }

      setIsHealthLoading(true);
      try {
        const token = (await resolveAuthToken(getToken)) ?? '';
        if (signal?.aborted) {
          return;
        }
        const service = CredentialsService.getInstance(token);
        const summaries = await service.listBrandAccountHealth(brandId);
        if (!signal?.aborted) {
          setAccountHealth(summaries);
        }
      } catch (error) {
        if (!signal?.aborted) {
          logger.error('Failed to load account health', error);
        }
      } finally {
        if (!signal?.aborted) {
          setIsHealthLoading(false);
        }
      }
    },
    [brandId, connectedPlatformsCount, getToken],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadAccountHealth(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadAccountHealth]);

  const handleConnectPlatform = async (platform: string) => {
    try {
      setConnectingPlatform(platform);
      const token = (await resolveAuthToken(getToken)) ?? '';
      const service = new ServicesService(platform, token);
      const credentialOAuth = await service.postConnect({ brand: brandId });
      window.open(credentialOAuth.url, '_self');
    } catch (error) {
      logger.error(`Failed to initiate ${platform} OAuth:`, error);
      NotificationsService.getInstance().error(`Connect ${platform}`);
      setConnectingPlatform(null);
    }
  };

  const handleConfirmOverride = async () => {
    if (!selectedOverrideHealth) {
      return;
    }

    setIsOverrideSubmitting(true);
    try {
      const token = (await resolveAuthToken(getToken)) ?? '';
      const service = CredentialsService.getInstance(token);
      const updated = await service.overrideAccountHealth(
        selectedOverrideHealth.credentialId,
        {
          confirm: true,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          reason: 'Manual override confirmed from brand social dashboard.',
        },
      );
      setAccountHealth((current) => {
        const withoutUpdated = current.filter(
          (summary) => summary.credentialId !== updated.credentialId,
        );
        return [...withoutUpdated, updated];
      });
      NotificationsService.getInstance().success('Warmup override confirmed');
      setOverrideCredentialId(null);
    } catch (error) {
      logger.error('Failed to confirm account health override', error);
      NotificationsService.getInstance().error('Confirm warmup override');
    } finally {
      setIsOverrideSubmitting(false);
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
            <div className="rounded-lg bg-background-secondary px-4 py-5 text-sm text-muted-foreground shadow-border">
              No social accounts connected yet.
            </div>
          )}

          {healthRows.length > 0 ? (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Account health</h3>
                {isHealthLoading ? (
                  <span className="text-xs text-muted-foreground">
                    Checking
                  </span>
                ) : null}
              </div>
              <div className="space-y-2">
                {healthRows.map((summary) => (
                  <div
                    className="space-y-2 border-t border-border/70 pt-3 first:border-t-0 first:pt-0"
                    key={summary.credentialId}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {summary.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {summary.platform} · score {summary.score}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-sm border px-2 py-1 text-[10px] font-semibold uppercase ${getHealthToneClass(summary)}`}
                      >
                        {STATE_LABELS[summary.state]}
                      </span>
                    </div>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {formatHealthDetail(summary)}
                    </p>
                    {summary.holdPublishing ? (
                      <Button
                        size={ButtonSize.SM}
                        variant={ButtonVariant.OUTLINE}
                        onClick={() =>
                          setOverrideCredentialId(summary.credentialId)
                        }
                      >
                        Override 24h
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
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

      <Dialog
        open={Boolean(selectedOverrideHealth)}
        onOpenChange={(open) => {
          if (!open) {
            setOverrideCredentialId(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm warmup override</DialogTitle>
            <DialogDescription>
              This bypasses the account-health publishing hold for 24 hours. Use
              it only after reviewing the platform warmup guidance.
            </DialogDescription>
          </DialogHeader>

          {selectedOverrideHealth ? (
            <div className="space-y-4">
              <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                {selectedOverrideHealth.holdReason ??
                  'This account is currently held by warmup state.'}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                  onClick={() => setOverrideCredentialId(null)}
                >
                  Cancel
                </Button>
                <Button
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                  isLoading={isOverrideSubmitting}
                  onClick={handleConfirmOverride}
                >
                  Confirm override
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
