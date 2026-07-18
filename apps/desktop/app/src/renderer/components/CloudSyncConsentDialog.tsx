import type { IDesktopSyncConsentInput } from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { useState } from 'react';

interface CloudSyncConsentDialogProps {
  isSaving: boolean;
  onDecide: (input: IDesktopSyncConsentInput) => void;
}

export default function CloudSyncConsentDialog({
  isSaving,
  onDecide,
}: CloudSyncConsentDialogProps) {
  const [allowFullAssetUploads, setAllowFullAssetUploads] = useState(false);

  return (
    <div
      aria-labelledby="cloud-sync-consent-title"
      aria-modal="true"
      className="sync-consent-backdrop"
      role="dialog"
    >
      <div className="sync-consent-dialog">
        <div>
          <span className="sync-consent-eyebrow">Genfeed Cloud connected</span>
          <h2 id="cloud-sync-consent-title">Choose what leaves this device</h2>
          <p className="muted-text">
            Sync stays off until you make an explicit choice.
          </p>
        </div>

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
            checked={allowFullAssetUploads}
            disabled={isSaving}
            onCheckedChange={(checked) =>
              setAllowFullAssetUploads(checked === true)
            }
          />
          <div>
            <strong>Allow policy-approved full asset uploads</strong>
            <p className="muted-text">
              You can leave this off to sync threads and metadata only.
            </p>
          </div>
        </div>

        <div className="sync-consent-actions">
          <Button
            disabled={isSaving}
            onClick={() =>
              onDecide({
                allowFullAssetUploads: false,
                status: 'declined',
              })
            }
            type="button"
            variant={ButtonVariant.GHOST}
          >
            Not now
          </Button>
          <Button
            disabled={isSaving}
            onClick={() =>
              onDecide({
                allowFullAssetUploads,
                status: 'granted',
              })
            }
            type="button"
            variant={ButtonVariant.DEFAULT}
          >
            {isSaving ? 'Saving…' : 'Start sync'}
          </Button>
        </div>
      </div>
    </div>
  );
}
