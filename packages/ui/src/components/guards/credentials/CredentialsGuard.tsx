'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { CardEmptySize } from '@genfeedai/enums';
import type { CredentialsGuardProps } from '@genfeedai/props/guards/credentials-guard.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Loading from '@ui/loading/default/Loading';
import { useMemo } from 'react';
import { HiLink } from 'react-icons/hi2';

/**
 * CredentialsGuard - Guards content that requires connected social credentials
 *
 * Shows loading state while brand context is loading, then either:
 * - Empty state with CTA if no connected credentials
 * - Children if credentials exist
 */
export default function CredentialsGuard({ children }: CredentialsGuardProps) {
  const { isReady, selectedBrand } = useBrand();

  // Read credentials directly from selectedBrand to avoid race condition
  // (credentials state is set via useEffect which runs after render)
  const hasConnectedCredentials = useMemo(() => {
    const brandCredentials = selectedBrand?.credentials;
    if (!Array.isArray(brandCredentials)) {
      return false;
    }
    return brandCredentials.some((c) => c.isConnected);
  }, [selectedBrand]);

  // Show loading while brand context initializes
  if (!isReady || !selectedBrand) {
    return <Loading isFullSize={false} />;
  }

  // Show empty state when no connected credentials
  if (!hasConnectedCredentials) {
    return (
      <div className="min-h-fit flex flex-col justify-center items-center">
        <CardEmpty
          icon={HiLink}
          iconClassName="w-12 h-12"
          label="No Social Accounts Connected"
          description="Connect a social media account to start creating and scheduling posts."
          size={CardEmptySize.LG}
          action={{
            label: 'Connect Account',
            onClick: () => {
              window.open(`${EnvironmentService.apps.app}/brands`, '_blank');
            },
          }}
        />
      </div>
    );
  }

  return <>{children}</>;
}
