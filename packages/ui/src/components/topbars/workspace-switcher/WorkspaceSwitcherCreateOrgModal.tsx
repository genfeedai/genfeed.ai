'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { Modal } from '@ui/modals/compound/modal.compound';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';

type WorkspaceSwitcherCreateOrgModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newOrganizationLabel: string;
  onLabelChange: (value: string) => void;
  newOrganizationDescription: string;
  onDescriptionChange: (value: string) => void;
  isCreatingOrganization: boolean;
  createOrganizationError: string | null;
  onConfirm: () => void;
};

export default function WorkspaceSwitcherCreateOrgModal({
  open,
  onOpenChange,
  newOrganizationLabel,
  onLabelChange,
  newOrganizationDescription,
  onDescriptionChange,
  isCreatingOrganization,
  createOrganizationError,
  onConfirm,
}: WorkspaceSwitcherCreateOrgModalProps) {
  return (
    <Modal.Root open={open} onOpenChange={onOpenChange}>
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
                htmlFor="topbar-ws-org-name"
                className="text-xs font-medium text-white/70"
              >
                Name <span className="text-red-400">*</span>
              </label>
              <Input
                id="topbar-ws-org-name"
                type="text"
                value={newOrganizationLabel}
                onChange={(event) => onLabelChange(event.target.value)}
                placeholder="My Organization"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    onConfirm();
                  }
                }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="topbar-ws-org-description"
                className="text-xs font-medium text-white/70"
              >
                Description <span className="text-white/30">(optional)</span>
              </label>
              <Textarea
                id="topbar-ws-org-description"
                value={newOrganizationDescription}
                onChange={(event) => onDescriptionChange(event.target.value)}
                placeholder="What does this organization do?"
                rows={2}
                className="resize-none"
              />
            </div>

            {createOrganizationError ? (
              <p className="text-xs text-red-400">{createOrganizationError}</p>
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
              isCreatingOrganization || newOrganizationLabel.trim().length === 0
            }
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium"
          >
            {isCreatingOrganization ? 'Creating…' : 'Create'}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
