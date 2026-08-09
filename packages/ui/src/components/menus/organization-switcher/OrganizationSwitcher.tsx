'use client';

import { APP_ROUTES, createOrganizationAppRoute } from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useSubscription } from '@genfeedai/hooks/data/subscription/use-subscription/use-subscription';
import { getOrganizationLimitForTier } from '@genfeedai/pricing';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import SwitcherDropdown from '@ui/menus/switcher-dropdown/SwitcherDropdown';
import {
  SWITCHER_AVATAR_CLASSNAME,
  SWITCHER_CHEVRON_CLASSNAME,
  SWITCHER_LABEL_CLASSNAME,
  SWITCHER_TRIGGER_CLASSNAME,
  SWITCHER_TRIGGER_OPEN_CLASSNAME,
} from '@ui/menus/switchers/switcher-trigger.classes';
import { Modal } from '@ui/modals/compound/modal.compound';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { ChevronDown, Settings } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useReducer } from 'react';

import { useCreateOrganizationModal } from './use-create-organization-modal';

interface OrgEntry {
  id: string;
  label: string;
  slug: string;
  isActive: boolean;
  isOwner?: boolean;
  brand: { id: string; label: string } | null;
}

interface SwitcherState {
  error: string | null;
  isLoading: boolean;
  isSwitching: boolean;
  orgs: OrgEntry[];
}

interface OrganizationSwitcherProps {
  subscriptionTier?: string | null;
}

type SwitcherAction =
  | { type: 'ORGS_LOADED'; orgs: OrgEntry[] }
  | { type: 'LOAD_FAILED' }
  | { type: 'SWITCH_START' }
  | { type: 'SWITCH_FAILED' };

const INITIAL_SWITCHER_STATE: SwitcherState = {
  error: null,
  isLoading: true,
  isSwitching: false,
  orgs: [],
};

function switcherReducer(
  state: SwitcherState,
  action: SwitcherAction,
): SwitcherState {
  switch (action.type) {
    case 'ORGS_LOADED':
      return { ...state, error: null, isLoading: false, orgs: action.orgs };
    case 'LOAD_FAILED':
      return {
        ...state,
        error: 'Failed to load organizations',
        isLoading: false,
        orgs: [],
      };
    case 'SWITCH_START':
      return { ...state, isSwitching: true };
    case 'SWITCH_FAILED':
      return {
        ...state,
        error: 'Failed to switch organization',
        isSwitching: false,
      };
    default:
      return state;
  }
}

export default function OrganizationSwitcher({
  subscriptionTier,
}: OrganizationSwitcherProps = {}) {
  const getOrgsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );
  const { isSubscriptionActive } = useSubscription();
  const params = useParams<{ orgSlug?: string }>();
  const currentOrgSlug =
    typeof params?.orgSlug === 'string' ? params.orgSlug : undefined;

  const [{ error, isLoading, isSwitching, orgs }, dispatch] = useReducer(
    switcherReducer,
    INITIAL_SWITCHER_STATE,
  );
  const createModal = useCreateOrganizationModal(getOrgsService);

  // Fetch orgs on mount so the active org label is available immediately
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const svc = await getOrgsService();
        const data = await svc.getMyOrganizations();
        if (!cancelled) {
          dispatch({ orgs: data, type: 'ORGS_LOADED' });
        }
      } catch {
        if (!cancelled) {
          dispatch({ type: 'LOAD_FAILED' });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getOrgsService]);

  // Mirror the brand switcher: the active org is the one you're actually
  // viewing (URL slug), so the checkmark and trigger label stay in sync with
  // the route. Fall back to the server's isActive (derived from
  // lastUsedOrganizationId) on non-org routes like /admin or /settings where no
  // orgSlug param exists.
  const activeOrgId =
    (currentOrgSlug && orgs.find((o) => o.slug === currentOrgSlug)?.id) ||
    orgs.find((o) => o.isActive)?.id ||
    (orgs.length === 1 ? orgs[0]?.id : null) ||
    null;
  const activeOrg = orgs.find((o) => o.id === activeOrgId);
  const organizationLimit = getOrganizationLimitForTier(subscriptionTier);
  const hasOwnershipMetadata = orgs.some(
    (org) => typeof org.isOwner === 'boolean',
  );
  const organizationCountForLimit = hasOwnershipMetadata
    ? orgs.filter((org) => org.isOwner).length
    : orgs.length;
  const canCreateOrganization =
    isSubscriptionActive &&
    !isLoading &&
    (organizationLimit === null ||
      organizationCountForLimit < organizationLimit);

  const handleSwitch = useCallback(
    async (orgId: string) => {
      if (isSwitching || orgId === activeOrgId) {
        return;
      }
      const target = orgs.find((organization) => organization.id === orgId);
      if (!target?.slug) {
        dispatch({ type: 'SWITCH_FAILED' });
        return;
      }
      dispatch({ type: 'SWITCH_START' });
      try {
        const svc = await getOrgsService();
        await svc.switchOrganization(orgId);
        // A hard navigation re-syncs all session-scoped data, and the explicit
        // new route guarantees no transcript, draft, or approval crosses the
        // organization boundary.
        window.location.assign(
          createOrganizationAppRoute(target.slug, APP_ROUTES.AGENT.NEW),
        );
      } catch {
        dispatch({ type: 'SWITCH_FAILED' });
      }
    },
    [activeOrgId, getOrgsService, isSwitching, orgs],
  );

  const displayLabel = error ?? activeOrg?.label ?? 'Organization';
  return (
    <>
      <SwitcherDropdown
        className="w-full"
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
          <div
            className={cn(
              SWITCHER_TRIGGER_CLASSNAME,
              isSwitching && 'cursor-not-allowed opacity-50',
              isOpen && SWITCHER_TRIGGER_OPEN_CLASSNAME,
            )}
          >
            <div className={SWITCHER_AVATAR_CLASSNAME}>
              {displayLabel.charAt(0).toUpperCase()}
            </div>
            <span
              className={cn(
                SWITCHER_LABEL_CLASSNAME,
                error && 'text-destructive',
              )}
            >
              {isSwitching ? 'Switching\u2026' : displayLabel}
            </span>
            <ChevronDown
              className={cn(SWITCHER_CHEVRON_CLASSNAME, isOpen && 'rotate-180')}
            />
          </div>
        )}
        onSelect={(id) => void handleSwitch(id)}
        isDisabled={isSwitching}
        isLoading={isLoading}
        emptyMessage={error ?? 'No organizations'}
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
