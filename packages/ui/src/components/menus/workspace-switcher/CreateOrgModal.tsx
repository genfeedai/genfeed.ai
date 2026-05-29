'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { Modal } from '@ui/modals/compound/modal.compound';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';

type CreateOrgModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  newOrgLabel: string;
  onNewOrgLabelChange: (value: string) => void;
  newOrgDescription: string;
  onNewOrgDescriptionChange: (value: string) => void;
  isCreatingOrg: boolean;
  createOrgError: string | null;
  onCreateOrg: () => void;
};

export function CreateOrgModal({
  isOpen,
  onOpenChange,
  newOrgLabel,
  onNewOrgLabelChange,
  newOrgDescription,
  onNewOrgDescriptionChange,
  isCreatingOrg,
  createOrgError,
  onCreateOrg,
}: CreateOrgModalProps) {
  return (
    <Modal.Root open={isOpen} onOpenChange={onOpenChange}>
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
              <label
                htmlFor="workspace-switcher-org-name"
                className="text-xs font-medium text-white/70"
              >
                Name <span className="text-red-400">*</span>
              </label>
              <Input
                id="workspace-switcher-org-name"
                type="text"
                value={newOrgLabel}
                onChange={(e) => onNewOrgLabelChange(e.target.value)}
                placeholder="My Organization"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onCreateOrg();
                  }
                }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="workspace-switcher-org-description"
                className="text-xs font-medium text-white/70"
              >
                Description <span className="text-white/30">(optional)</span>
              </label>
              <Textarea
                id="workspace-switcher-org-description"
                value={newOrgDescription}
                onChange={(e) => onNewOrgDescriptionChange(e.target.value)}
                placeholder="What does this organization do?"
                rows={2}
                className="resize-none"
              />
            </div>

            {createOrgError ? (
              <p className="text-xs text-red-400">{createOrgError}</p>
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
            isDisabled={isCreatingOrg || newOrgLabel.trim().length === 0}
            onClick={onCreateOrg}
            className="px-4 py-2 text-sm font-medium"
          >
            {isCreatingOrg ? 'Creating…' : 'Create'}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
