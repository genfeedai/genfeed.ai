'use client';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  InstagramIcon,
  LinkedinIcon,
  TiktokIcon,
  XTwitterIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { CredentialsService } from '@services/organization/credentials.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Spinner from '@ui/primitives/spinner';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { FirstDraftsScheduleProps } from '@/features/onboarding/props/first-drafts.props';
import { usePlatformOAuthConnect } from '@/hooks/auth/use-platform-oauth-connect/use-platform-oauth-connect';

const PLATFORMS = [
  { id: 'instagram', Icon: InstagramIcon },
  { id: 'tiktok', Icon: TiktokIcon },
  { id: 'twitter', Icon: XTwitterIcon },
  { id: 'linkedin', Icon: LinkedinIcon },
] as const;

export default function ScheduleStep({ brandId }: FirstDraftsScheduleProps) {
  const t = useTranslations('pages.onboarding.firstDrafts');
  const { getToken } = useAuthIdentity();
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  const connect = usePlatformOAuthConnect({
    brandId,
    returnTo: '/onboarding/brand?step=schedule',
  });
  const [connected, setConnected] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setConnected([]);
    setHasError(false);
    void (async () => {
      try {
        const token = await resolveAuthToken(tokenRef.current);
        if (!token) throw new Error('Not authenticated');
        const rows = await CredentialsService.getInstance(
          token,
        ).listBrandPublishingReadiness(brandId, controller.signal);
        if (!controller.signal.aborted)
          setConnected(
            rows
              .filter((row) => row.credentialId)
              .map((row) => String(row.providerKey).toLowerCase()),
          );
      } catch {
        if (!controller.signal.aborted) setHasError(true);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [brandId]);
  if (isLoading) return <Spinner ariaLabel={t('loading')} />;
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {PLATFORMS.map(({ id, Icon }) => {
          const label = t(`platforms.${id}`);
          const isConnected = connected.includes(id);
          return (
            <Card
              key={id}
              bodyClassName="gap-5 p-5"
              data-testid={`connect-card-${id}`}
            >
              <div className="flex items-center gap-3">
                <Icon className="size-8 shrink-0" aria-hidden="true" />
                <h2 className="text-sm font-semibold">{label}</h2>
              </div>
              <Button
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
                isDisabled={isConnected || connecting !== null}
                isLoading={connecting === id}
                ariaLabel={t(
                  isConnected
                    ? 'connections.connectedLabel'
                    : 'schedule.connect',
                  { platform: label },
                )}
                onClick={() => {
                  setConnecting(id);
                  setHasError(false);
                  void connect(id)
                    .catch(() => setHasError(true))
                    .finally(() => setConnecting(null));
                }}
              >
                {isConnected && <Check className="size-3.5" />}
                {t(
                  isConnected ? 'connections.connected' : 'connections.connect',
                )}
              </Button>
            </Card>
          );
        })}
      </div>
      {hasError && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {t('errors.connect')}
        </p>
      )}
    </div>
  );
}
