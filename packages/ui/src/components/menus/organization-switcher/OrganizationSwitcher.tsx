'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import SwitcherDropdown from '@ui/menus/switcher-dropdown/SwitcherDropdown';
import { Modal } from '@ui/modals/compound/Modal';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { HiChevronDown, HiOutlineCog6Tooth } from 'react-icons/hi2';

interface OrgEntry {
  id: string;
  label: string;
  isActive: boolean;
  brand: { id: string; label: string } | null;
}

export default function OrganizationSwitcher() {
  const getOrgsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );
  const router = useRouter();
  const { orgHref } = useOrgUrl();

  const [isSwitching, setIsSwitching] = useState(false);
  const [orgs, setOrgs] = useState<OrgEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Create org modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newOrgLabel, setNewOrgLabel] = useState('');
  const [newOrgDescription, setNewOrgDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Fetch orgs on mount so the active org label is available immediately
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const svc = await getOrgsService();
        const data = await svc.getMyOrganizations();
        if (!cancelled) {
          setOrgs(data);
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load organizations');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getOrgsService]);

  const handleSwitch = useCallback(
    async (orgId: string) => {
      if (isSwitching) {
        return;
      }
      setIsSwitching(true);
      try {
        const svc = await getOrgsService();
        await svc.switchOrganization(orgId);
        window.location.reload();
      } catch {
        setIsSwitching(false);
        setError('Failed to switch organization');
      }
    },
    [getOrgsService, isSwitching],
  );

  const handleCreate = useCallback(async () => {
    if (!newOrgLabel.trim()) {
      setCreateError('Organization name is required');
      return;
    }
    setIsCreating(true);
    setCreateError(null);
    try {
      const svc = await getOrgsService();
      await svc.createOrganization({
        description: newOrgDescription.trim() || undefined,
        label: newOrgLabel.trim(),
      });
      setCreateModalOpen(false);
      setNewOrgLabel('');
      setNewOrgDescription('');
      window.location.reload();
    } catch {
      setIsCreating(false);
      setCreateError('Failed to create organization');
    }
  }, [getOrgsService, newOrgDescription, newOrgLabel]);

  const activeOrg = orgs.find((o) => o.isActive);
  const displayLabel = error ?? activeOrg?.label ?? 'Organization';
  const handleOpenOrganizationSettings = useCallback(() => {
    router.push(orgHref('/settings'));
  }, [router, orgHref]);

  return (
    <>
      <SwitcherDropdown
        className="w-full"
        items={orgs.map((o) => ({
          id: o.id,
          isActive: o.isActive,
          label: o.label,
        }))}
        renderTrigger={({ isOpen }) => (
          <div
            className={cn(
              'flex h-9 w-full items-center gap-2 rounded-lg px-3 py-2 transition-all cursor-pointer',
              'hover:bg-white/[0.06]',
              isSwitching && 'opacity-50 cursor-not-allowed',
              isOpen && 'bg-white/[0.06]',
            )}
          >
            <div className="w-6 h-6 rounded bg-white/20 flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
              {displayLabel.charAt(0).toUpperCase()}
            </div>
            <span
              className={cn(
                'flex-1 text-left truncate text-sm font-medium',
                error ? 'text-red-400' : 'text-white/90',
              )}
            >
              {isSwitching ? 'Switching\u2026' : displayLabel}
            </span>
            <HiChevronDown
              className={cn(
                'w-3.5 h-3.5 text-white/40 transition-transform duration-200 flex-shrink-0',
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
            icon: HiOutlineCog6Tooth,
            label: 'Organization Settings',
            onAction: handleOpenOrganizationSettings,
          },
          {
            label: 'New Organization',
            onAction: () => setCreateModalOpen(true),
          },
        ]}
      />

      {/* Create Organization Modal */}
      <Modal.Root open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <Modal.Content size="sm">
          <Modal.Header>
            <Modal.Title>Create Organization</Modal.Title>
            <Modal.Description>
              A new workspace with a default brand and 100 starter credits.
            </Modal.Description>
          </Modal.Header>

          <Modal.Body>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-white/70">
                  Name <span className="text-red-400">*</span>
                </label>
                <Input
                  type="text"
                  value={newOrgLabel}
                  onChange={(e) => setNewOrgLabel(e.target.value)}
                  placeholder="My Organization"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void handleCreate();
                    }
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-white/70">
                  Description <span className="text-white/30">(optional)</span>
                </label>
                <Textarea
                  value={newOrgDescription}
                  onChange={(e) => setNewOrgDescription(e.target.value)}
                  placeholder="What does this organization do?"
                  rows={2}
                  className="resize-none"
                />
              </div>
              {createError && (
                <p className="text-xs text-red-400">{createError}</p>
              )}
            </div>
          </Modal.Body>

          <Modal.Footer>
            <Modal.CloseButton asChild>
              <Button
                variant={ButtonVariant.GHOST}
                withWrapper={false}
                className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
              >
                Cancel
              </Button>
            </Modal.CloseButton>
            <Button
              variant={ButtonVariant.DEFAULT}
              withWrapper={false}
              isDisabled={isCreating || !newOrgLabel.trim()}
              onClick={() => void handleCreate()}
              className="rounded-lg px-4 py-2 text-sm font-medium"
            >
              {isCreating ? 'Creating\u2026' : 'Create'}
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    </>
  );
}
