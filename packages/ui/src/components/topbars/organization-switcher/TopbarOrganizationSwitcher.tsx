'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import SwitcherDropdown from '@ui/menus/switcher-dropdown/SwitcherDropdown';
import { Modal } from '@ui/modals/compound/Modal';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HiChevronDown, HiOutlineCog6Tooth } from 'react-icons/hi2';

type OrganizationEntry = {
  id: string;
  label: string;
  isActive: boolean;
  brand: { id: string; label: string } | null;
};

export default function TopbarOrganizationSwitcher() {
  const router = useRouter();
  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const [isSwitchingOrganization, setIsSwitchingOrganization] = useState(false);
  const [organizations, setOrganizations] = useState<OrganizationEntry[]>([]);
  const [organizationsError, setOrganizationsError] = useState<string | null>(
    null,
  );

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newOrganizationLabel, setNewOrganizationLabel] = useState('');
  const [newOrganizationDescription, setNewOrganizationDescription] =
    useState('');
  const [isCreatingOrganization, setIsCreatingOrganization] = useState(false);
  const [createOrganizationError, setCreateOrganizationError] = useState<
    string | null
  >(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const service = await getOrganizationsService();
        const data = await service.getMyOrganizations();

        if (!cancelled) {
          setOrganizations(data);
          setOrganizationsError(null);
        }
      } catch {
        if (!cancelled) {
          setOrganizationsError('Failed to load organizations');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getOrganizationsService]);

  const activeOrganization = useMemo(
    () => organizations.find((organization) => organization.isActive),
    [organizations],
  );
  const displayLabel =
    organizationsError ?? activeOrganization?.label ?? 'Organization';

  const handleSwitchOrganization = useCallback(
    async (organizationId: string) => {
      if (isSwitchingOrganization) {
        return;
      }

      setIsSwitchingOrganization(true);

      try {
        const service = await getOrganizationsService();
        await service.switchOrganization(organizationId);
        window.location.reload();
      } catch {
        setIsSwitchingOrganization(false);
        setOrganizationsError('Failed to switch organization');
      }
    },
    [getOrganizationsService, isSwitchingOrganization],
  );

  const handleOpenOrganizationSettings = useCallback(() => {
    router.push('/settings/organization');
  }, [router]);

  const handleCreateOrganization = useCallback(async () => {
    const trimmedLabel = newOrganizationLabel.trim();

    if (!trimmedLabel) {
      setCreateOrganizationError('Organization name is required');
      return;
    }

    setIsCreatingOrganization(true);
    setCreateOrganizationError(null);

    try {
      const service = await getOrganizationsService();
      await service.createOrganization({
        description: newOrganizationDescription.trim() || undefined,
        label: trimmedLabel,
      });
      setCreateModalOpen(false);
      setNewOrganizationLabel('');
      setNewOrganizationDescription('');
      window.location.reload();
    } catch {
      setIsCreatingOrganization(false);
      setCreateOrganizationError('Failed to create organization');
    }
  }, [
    getOrganizationsService,
    newOrganizationDescription,
    newOrganizationLabel,
  ]);

  return (
    <>
      <SwitcherDropdown
        className="flex items-center"
        items={organizations.map((organization) => ({
          id: organization.id,
          isActive: organization.isActive,
          label: organization.label,
        }))}
        renderTrigger={({ isOpen }) => (
          <div
            data-testid="organization-switcher-trigger"
            className={cn(
              'flex items-center gap-2 px-2 py-1.5 transition-all cursor-pointer',
              'hover:bg-white/[0.06]',
              isSwitchingOrganization && 'opacity-50 cursor-not-allowed',
              isOpen && 'bg-white/[0.06]',
            )}
          >
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center bg-white/20 text-xs font-semibold text-white">
              {displayLabel.charAt(0).toUpperCase()}
            </div>
            <span
              className={cn(
                'hidden max-w-truncate-md truncate text-sm font-medium md:inline',
                organizationsError ? 'text-red-400' : 'text-white/90',
              )}
            >
              {isSwitchingOrganization ? 'Switching…' : displayLabel}
            </span>
            <HiChevronDown
              className={cn(
                'hidden h-3.5 w-3.5 flex-shrink-0 text-white/40 transition-transform duration-200 md:block',
                isOpen && 'rotate-180',
              )}
            />
          </div>
        )}
        onSelect={(organizationId) =>
          void handleSwitchOrganization(organizationId)
        }
        isDisabled={isSwitchingOrganization}
        hasSearch={organizations.length >= 5}
        searchPlaceholder="Search organizations..."
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
                  value={newOrganizationLabel}
                  onChange={(event) =>
                    setNewOrganizationLabel(event.target.value)
                  }
                  placeholder="My Organization"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void handleCreateOrganization();
                    }
                  }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-white/70">
                  Description <span className="text-white/30">(optional)</span>
                </label>
                <Textarea
                  value={newOrganizationDescription}
                  onChange={(event) =>
                    setNewOrganizationDescription(event.target.value)
                  }
                  placeholder="What does this organization do?"
                  rows={2}
                  className="resize-none"
                />
              </div>

              {createOrganizationError ? (
                <p className="text-xs text-red-400">
                  {createOrganizationError}
                </p>
              ) : null}
            </div>
          </Modal.Body>

          <Modal.Footer>
            <Modal.CloseButton asChild>
              <Button
                variant={ButtonVariant.GHOST}
                withWrapper={false}
                className="px-4 py-2 text-sm text-white/60 transition-colors hover:text-white"
              >
                Cancel
              </Button>
            </Modal.CloseButton>
            <Button
              variant={ButtonVariant.DEFAULT}
              withWrapper={false}
              isDisabled={
                isCreatingOrganization ||
                newOrganizationLabel.trim().length === 0
              }
              onClick={() => void handleCreateOrganization()}
              className="px-4 py-2 text-sm font-medium"
            >
              {isCreatingOrganization ? 'Creating\u2026' : 'Create'}
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    </>
  );
}
