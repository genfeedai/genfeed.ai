import type { IDesktopSyncConsentInput } from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { useRef, useState } from 'react';

interface CloudSyncConsentDialogProps {
  isSaving: boolean;
  onDecide: (input: IDesktopSyncConsentInput) => void;
  onDismiss: () => void;
}

export default function CloudSyncConsentDialog({
  isSaving,
  onDecide,
  onDismiss,
}: CloudSyncConsentDialogProps) {
  const [hasFullAssetUploadConsent, setHasFullAssetUploadConsent] =
    useState(false);
  const notNowRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open && !isSaving) {
          onDismiss();
        }
      }}
      open
    >
      <DialogContent
        className="sync-consent-dialog"
        onEscapeKeyDown={(event) => {
          if (isSaving) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          notNowRef.current?.focus();
        }}
        showCloseButton={false}
      >
        <DialogHeader>
          <span className="sync-consent-eyebrow">Genfeed Cloud connected</span>
          <DialogTitle id="cloud-sync-consent-title">
            Choose what leaves this device
          </DialogTitle>
          <DialogDescription className="muted-text">
            Sync stays off until you make an explicit choice.
          </DialogDescription>
        </DialogHeader>

        <ul className="sync-consent-list">
          <li>Threads sync with your connected Genfeed Cloud account.</li>
          <li>Brand and asset metadata sync without uploading asset files.</li>
          <li>
            Full asset files upload only when enabled below and the individual
            asset policy is set to full.
          </li>
          <li>
            Assets with <code>uploadPolicy=never</code> never upload.
          </li>
        </ul>

        <div className="sync-consent-option">
          <Checkbox
            aria-label="Allow full asset uploads"
            checked={hasFullAssetUploadConsent}
            disabled={isSaving}
            onCheckedChange={(checked) =>
              setHasFullAssetUploadConsent(checked === true)
            }
          />
          <div>
            <strong>Allow policy-approved full asset uploads</strong>
            <p className="muted-text">
              You can leave this off to sync threads and metadata only.
            </p>
          </div>
        </div>

        <DialogFooter className="sync-consent-actions">
          <Button
            disabled={isSaving}
            onClick={onDismiss}
            ref={notNowRef}
            type="button"
            variant={ButtonVariant.GHOST}
          >
            Not now
          </Button>
          <Button
            disabled={isSaving}
            onClick={() =>
              onDecide({
                hasFullAssetUploadConsent,
                status: 'granted',
              })
            }
            type="button"
            variant={ButtonVariant.DEFAULT}
          >
            {isSaving ? 'Saving…' : 'Start sync'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
