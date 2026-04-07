'use client';

import { AssetScope, ButtonVariant } from '@genfeedai/enums';
import type { IngredientTabsSharingProps } from '@props/content/ingredient.props';
import { ClipboardService } from '@services/core/clipboard.service';
import { EnvironmentService } from '@services/core/environment.service';
import { NotificationsService } from '@services/core/notifications.service';
import { ScopeSelector } from '@ui/assets/ScopeSelector';
import Button from '@ui/buttons/base/Button';
import { HiDocumentDuplicate } from 'react-icons/hi2';

export default function IngredientTabsSharing({
  ingredient,
  isUpdating = false,
  onUpdateSharing,
}: IngredientTabsSharingProps) {
  const clipboardService = ClipboardService.getInstance();
  const notificationsService = NotificationsService.getInstance();

  const handleCopyLink = async () => {
    if (!ingredient?.category) {
      return;
    }

    try {
      const url = `${EnvironmentService.apps.app}/${ingredient.category}s/${ingredient.id}`;
      await clipboardService.copyToClipboard(url);
      notificationsService.success('Link copied to clipboard');
    } catch {
      notificationsService.error('Failed to copy link');
    }
  };

  // Only show share link button when ingredient is shared (not USER scope)
  const isShared = ingredient.scope && ingredient.scope !== AssetScope.USER;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
          Access Control
        </p>
        <p className="mt-1 text-sm text-white/65">
          Choose who can access this asset and whether a public link should be
          exposed.
        </p>
      </div>

      <ScopeSelector
        value={ingredient.scope || AssetScope.USER}
        onChange={(scope) => onUpdateSharing?.('scope', scope)}
        isDisabled={isUpdating}
        showLabel={false}
        variant="panel"
      />

      {isShared && (
        <div className="mt-4">
          <Button
            label={
              <>
                <HiDocumentDuplicate className="w-4 h-4" />
                Copy Link
              </>
            }
            onClick={handleCopyLink}
            variant={ButtonVariant.GHOST}
            tooltip="Copy shareable link to clipboard"
            tooltipPosition="top"
          />
        </div>
      )}
    </div>
  );
}
