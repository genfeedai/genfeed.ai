'use client';

import { AssetScope, ButtonVariant } from '@genfeedai/contracts';
import { createLibraryAssetRoute } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import type { IngredientTabsSharingProps } from '@genfeedai/props/content/ingredient.props';
import { ClipboardService } from '@genfeedai/services/core/clipboard.service';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { ScopeSelector } from '@ui/assets/ScopeSelector';
import { Button } from '@ui/primitives/button';
import { Copy } from 'lucide-react';

export default function IngredientTabsSharing({
  ingredient,
  isUpdating = false,
  onUpdateSharing,
}: IngredientTabsSharingProps) {
  const clipboardService = ClipboardService.getInstance();
  const notificationsService = NotificationsService.getInstance();
  const { href } = useOrgUrl();

  const handleCopyLink = async () => {
    if (!ingredient?.category) {
      return;
    }

    try {
      const url = `${EnvironmentService.apps.app}${href(
        createLibraryAssetRoute(ingredient.category, ingredient.id),
      )}`;
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
      <div className="rounded-2xl bg-background-tertiary p-4 shadow-border">
        <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Access Control
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
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
                <Copy className="size-4" />
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
