'use client';

import { createOrganizationAppRoute } from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import SwitcherDropdown from '@ui/menus/switcher-dropdown/SwitcherDropdown';
import { Modal } from '@ui/modals/compound/modal.compound';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useReducer } from 'react';
import { HiChevronDown, HiOutlineCog6Tooth } from 'react-icons/hi2';
import { useCreateOrganizationModal } from './use-create-organization-modal';

interface OrgEntry {
  id: string;
  label: string;
  slug: string;
  isActive: boolean;
  brand: { id: string; label: string } | null;
}

interface SwitcherState {
  error: string | null;
  isSwitching: boolean;
  orgs: OrgEntry[];
}

type SwitcherAction =
  | { type: 'ORGS_LOADED'; orgs: OrgEntry[] }
  | { type: 'LOAD_FAILED' }
  | { type: 'SWITCH_START' }
  | { type: 'SWITCH_FAILED' };

const INITIAL_SWITCHER_STATE: SwitcherState = {
  error: null,
  isSwitching: false,
  orgs: [],
};

function switcherReducer(
  state: SwitcherState,
  action: SwitcherAction,
): SwitcherState {
  switch (action.type) {
    case 'ORGS_LOADED':
      return { ...state, orgs: action.orgs };
    case 'LOAD_FAILED':
      return { ...state, error: 'Failed to load organizations' };
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

export default function OrganizationSwitcher() {
  const getOrgsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );
  const { push } = useRouter();
  const params = useParams<{ orgSlug?: string }>();
  const currentOrgSlug =
    typeof params?.orgSlug === 'string' ? params.orgSlug : undefined;

  const [{ error, isSwitching, orgs }, dispatch] = useReducer(
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
    null;
  const activeOrg = orgs.find((o) => o.id === activeOrgId);

  const handleSwitch = useCallback(
    async (orgId: string) => {
      if (isSwitching || orgId === activeOrgId) {
        return;
      }
      dispatch({ type: 'SWITCH_START' });
      try {
        const svc = await getOrgsService();
        await svc.switchOrganization(orgId);
        // Navigate to the target org's landing route so the URL reflects the
        // now-active org. The previous flow reloaded the *current* URL, which
        // still carried the old org slug, so the app rebooted on the same org
        // and nothing appeared to switch (#1227). A full navigation (matching
        // the create-organization flow) re-syncs session-scoped workspace data
        // across the org boundary; org-landing then routes to the default brand.
        const target = orgs.find((o) => o.id === orgId);
        if (target?.slug) {
          window.location.assign(`/${target.slug}`);
        } else {
          window.location.reload();
        }
      } catch {
        dispatch({ type: 'SWITCH_FAILED' });
      }
    },
    [activeOrgId, getOrgsService, isSwitching, orgs],
  );

  const displayLabel = error ?? activeOrg?.label ?? 'Organization';
  const handleOpenOrganizationSettings = useCallback(
    (organizationSlug: string) => {
      push(createOrganizationAppRoute(organizationSlug, '/settings'));
    },
    [push],
  );

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
            icon: HiOutlineCog6Tooth,
            onAction: () => handleOpenOrganizationSettings(o.slug),
          },
        }))}
        renderTrigger={({ isOpen }) => (
          <div
            className={cn(
              'flex h-9 w-full items-center gap-2 rounded-lg px-3 py-2 transition-all cursor-pointer',
              'hover:bg-foreground/[0.06]',
              isSwitching && 'opacity-50 cursor-not-allowed',
              isOpen && 'bg-foreground/[0.06]',
            )}
          >
            <div className="size-6 rounded bg-foreground/20 flex items-center justify-center text-xs font-semibold text-foreground flex-shrink-0">
              {displayLabel.charAt(0).toUpperCase()}
            </div>
            <span
              className={cn(
                'flex-1 text-left truncate text-sm font-medium',
                error ? 'text-red-400' : 'text-foreground/90',
              )}
            >
              {isSwitching ? 'Switching\u2026' : displayLabel}
            </span>
            <HiChevronDown
              className={cn(
                'size-3.5 text-foreground/40 transition-transform duration-200 flex-shrink-0',
                isOpen && 'rotate-180',
              )}
            />
          </div>
        )}
        onSelect={(id) => void handleSwitch(id)}
        isDisabled={isSwitching}
        hasSearch={orgs.length >= 5}
        footerActions={[
          {
            label: 'New Organization',
            onAction: createModal.open,
          },
        ]}
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
                  Name <span className="text-red-400">*</span>
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
                <p className="text-xs text-red-400">
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
