'use client';

import { useAccessState } from '@genfeedai/contexts/providers/access-state/access-state.provider';
import { useRoutedOrganization } from '@genfeedai/contexts/user/organization-context/organization-context';
import { ButtonVariant } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createOrganizationAppRoute,
  getOrgSwitchHref,
} from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { getOrganizationLimitForTier } from '@genfeedai/pricing';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import SwitcherDropdown from '@ui/menus/switcher-dropdown/SwitcherDropdown';
import {
  SWITCHER_CHEVRON_CLASSNAME,
  SWITCHER_TRIGGER_OPEN_CLASSNAME,
} from '@ui/menus/switchers/switcher-trigger.classes';
import { BrandAvatar } from '@ui/primitives/brand-avatar';
import { Button } from '@ui/primitives/button';
import { ChevronsUpDown, Settings } from 'lucide-react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { useSubscription } from '@/hooks/data/subscription/use-subscription/use-subscription';

// Loaded on first "New Organization": its zod form validation and form
// primitives stay out of the first-load JavaScript of every protected route.
const LazyCreateOrganizationDialog = dynamic(
  () => import('./CreateOrganizationDialog'),
  { ssr: false },
);

interface OrganizationSwitcherProps {
  compactOnMobile?: boolean;
  subscriptionTier?: string | null;
}

export default function OrganizationSwitcher({
  compactOnMobile = false,
  subscriptionTier,
}: OrganizationSwitcherProps = {}) {
  const getOrgsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );
  const { isSubscriptionActive } = useSubscription();
  const { isLoading: isAccessLoading, isSuperAdmin } = useAccessState();
  const pathname = usePathname() ?? APP_ROUTES.ROOT;
  const { push } = useRouter();
  const {
    confirmedOrganizationId: activeOrgId,
    organizations: orgs,
    status,
    switchOrganization,
  } = useRoutedOrganization();
  const translate = useTranslations('ui.organizationSwitcher');
  const isLoading = status === 'loading';
  const isSwitching = status === 'switching';
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  // Stays true after the first open so the dialog can animate closed.
  const [hasRequestedCreate, setHasRequestedCreate] = useState(false);
  const openCreateDialog = useCallback(() => {
    setHasRequestedCreate(true);
    setIsCreateOpen(true);
  }, []);
  const activeOrg = orgs.find((o) => o.id === activeOrgId);
  const organizationLimit = getOrganizationLimitForTier(subscriptionTier);
  const hasOwnershipMetadata = orgs.some(
    (org) => typeof org.isOwner === 'boolean',
  );
  const organizationCountForLimit = hasOwnershipMetadata
    ? orgs.filter((org) => org.isOwner).length
    : orgs.length;
  const canCreateOrganization =
    !isAccessLoading &&
    !isLoading &&
    (isSuperAdmin ||
      (isSubscriptionActive &&
        (organizationLimit === null ||
          organizationCountForLimit < organizationLimit)));

  const handleSwitch = useCallback(
    async (orgId: string) => {
      if (isSwitching || orgId === activeOrgId) {
        return;
      }
      const target = orgs.find((organization) => organization.id === orgId);
      if (!target?.slug) {
        return;
      }
      const confirmedSlug = await switchOrganization(orgId);
      if (confirmedSlug) {
        push(getOrgSwitchHref(confirmedSlug, pathname));
      }
    },
    [activeOrgId, isSwitching, orgs, pathname, push, switchOrganization],
  );

  const displayLabel = activeOrg?.label ?? 'Organization';
  return (
    <>
      <SwitcherDropdown
        minWidth={240}
        items={orgs.map((o) => ({
          id: o.id,
          imageUrl: o.logoUrl || undefined,
          isActive: o.id === activeOrgId,
          label: o.label,
          trailingAction: {
            ariaLabel: `Open ${o.label} settings`,
            icon: Settings,
            href: createOrganizationAppRoute(o.slug, '/settings'),
            onAction: () => {},
          },
        }))}
        renderTrigger={({ isOpen }) => (
          // Same h-8 chip as the brand switcher. The old size-9 rail tile
          // sat in the topbar band and made that row taller than its neighbors.
          <Button
            type="button"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            ariaLabel={`Switch organization, ${displayLabel}`}
            data-testid="organization-switcher-trigger"
            title={displayLabel}
            className={cn(
              'flex h-8 w-max max-w-52 min-w-0 cursor-pointer items-center gap-2 rounded-md px-1.5 text-left transition-colors duration-150 hover:bg-foreground/5',
              'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              compactOnMobile && 'gap-0 px-1 md:gap-2 md:px-1.5',
              isSwitching && 'cursor-not-allowed opacity-50',
              isOpen && SWITCHER_TRIGGER_OPEN_CLASSNAME,
            )}
          >
            <BrandAvatar
              alt={displayLabel}
              name={displayLabel}
              size="xs"
              src={activeOrg?.logoUrl}
            />
            <span
              className={cn(
                'min-w-0 truncate text-sm font-medium leading-none text-foreground',
                compactOnMobile && 'hidden md:inline',
              )}
            >
              {isSwitching ? translate('switching') : displayLabel}
            </span>
            <ChevronsUpDown
              className={cn(
                SWITCHER_CHEVRON_CLASSNAME,
                compactOnMobile && 'hidden md:block',
              )}
            />
          </Button>
        )}
        onSelect={(id) => void handleSwitch(id)}
        isDisabled={isSwitching}
        isLoading={isLoading}
        emptyMessage="No organizations"
        hasSearch={orgs.length >= 5}
        footerActions={
          canCreateOrganization
            ? [
                {
                  label: 'New Organization',
                  onAction: openCreateDialog,
                },
              ]
            : []
        }
      />

      {hasRequestedCreate && (
        <LazyCreateOrganizationDialog
          getOrgsService={getOrgsService}
          isOpen={isCreateOpen}
          onOpenChange={setIsCreateOpen}
        />
      )}
    </>
  );
}
