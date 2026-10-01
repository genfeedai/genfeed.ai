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
import { useSubscription } from '@genfeedai/hooks/data/subscription/use-subscription/use-subscription';
import { getOrganizationLimitForTier } from '@genfeedai/pricing';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import SwitcherDropdown from '@ui/menus/switcher-dropdown/SwitcherDropdown';
import {
  SWITCHER_AVATAR_CLASSNAME,
  SWITCHER_CHEVRON_CLASSNAME,
  SWITCHER_TRIGGER_OPEN_CLASSNAME,
} from '@ui/menus/switchers/switcher-trigger.classes';
import { Modal } from '@ui/modals/compound/modal.compound';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { ChevronsUpDown, Settings } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { useCreateOrganizationModal } from './use-create-organization-modal';

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
  const isLoading = status === 'loading';
  const isSwitching = status === 'switching';
  const createModal = useCreateOrganizationModal(getOrgsService);
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
          isActive: o.id === activeOrgId,
          label: o.label,
          trailingAction: {
            ariaLabel: `Open ${o.label} settings`,
            icon: Settings,
            href: createOrganizationAppRoute(o.slug, '/settings'),
            onAction: () => {},
            target: '_blank',
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
              'flex h-8 w-max max-w-52 min-w-0 cursor-pointer items-center gap-2 rounded-md px-1.5 text-left transition-colors duration-150 hover:bg-foreground/[0.06]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
              compactOnMobile && 'gap-0 px-1 md:gap-2 md:px-1.5',
              isSwitching && 'cursor-not-allowed opacity-50',
              isOpen && SWITCHER_TRIGGER_OPEN_CLASSNAME,
            )}
          >
            <span className={SWITCHER_AVATAR_CLASSNAME}>
              {displayLabel.charAt(0).toUpperCase()}
            </span>
            <span
              className={cn(
                'min-w-0 truncate text-sm font-medium leading-none text-foreground',
                compactOnMobile && 'hidden md:inline',
              )}
            >
              {isSwitching ? 'Switching…' : displayLabel}
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
                  onAction: createModal.open,
                },
              ]
            : []
        }
      />

      {/* Create Organization Modal */}
      <Modal.Root open={createModal.isOpen} onOpenChange={createModal.setOpen}>
        {/*
          Don't restore focus to the "New Organization" footer button on close —
          Radix's default focus return leaves a blue :focus-visible ring on that
          button (#1227). The brand switcher's "New Brand" overlay renders
          globally and never returns focus to its button, so it has no such ring;
          this mirrors that behavior.
        */}
        <Modal.Content
          size="sm"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <Modal.Header>
            <Modal.Title>Create Organization</Modal.Title>
            <Modal.Description>
              A new workspace with a default brand and 100 starter credits.
            </Modal.Description>
          </Modal.Header>

          <Modal.Body>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="org-switcher-name"
                  className="text-xs font-medium text-foreground/70"
                >
                  Name <span className="text-destructive">*</span>
                </label>
                <Input
                  id="org-switcher-name"
                  type="text"
                  value={createModal.label}
                  onChange={(e) => createModal.setLabel(e.target.value)}
                  placeholder="My Organization"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void createModal.submit();
                    }
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="org-switcher-description"
                  className="text-xs font-medium text-foreground/70"
                >
                  Description{' '}
                  <span className="text-foreground/30">(optional)</span>
                </label>
                <Textarea
                  id="org-switcher-description"
                  value={createModal.description}
                  onChange={(e) => createModal.setDescription(e.target.value)}
                  placeholder="What does this organization do?"
                  rows={2}
                  className="resize-none"
                />
              </div>
              {createModal.createError && (
                <p className="text-xs text-destructive">
                  {createModal.createError}
                </p>
              )}
            </div>
          </Modal.Body>

          <Modal.Footer>
            <Modal.CloseButton asChild>
              <Button
                variant={ButtonVariant.GHOST}
                withWrapper={false}
                className="px-4 py-2 text-sm text-foreground/60 hover:text-foreground transition-colors"
              >
                Cancel
              </Button>
            </Modal.CloseButton>
            <Button
              variant={ButtonVariant.DEFAULT}
              withWrapper={false}
              isDisabled={createModal.isCreating || !createModal.label.trim()}
              onClick={() => void createModal.submit()}
              className="rounded-lg px-4 py-2 text-sm font-medium"
            >
              {createModal.isCreating ? 'Creating\u2026' : 'Create'}
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    </>
  );
}
