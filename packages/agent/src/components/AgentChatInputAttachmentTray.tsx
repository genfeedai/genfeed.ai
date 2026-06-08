import type { PromptBarAttachedAsset } from '@genfeedai/props/studio/prompt-bar.props';
import PromptBarAttachedAssetsTray from '@ui/prompt-bars/components/attached-assets-tray/PromptBarAttachedAssetsTray';
import type { ReactElement } from 'react';

type AgentChatInputAttachmentTrayProps = {
  assets: PromptBarAttachedAsset[];
  isDisabled: boolean | undefined;
  onBrowseAssets: () => void;
  onRemoveAttachedAsset: (assetId: string) => void;
};

export function AgentChatInputAttachmentTray({
  assets,
  isDisabled,
  onBrowseAssets,
  onRemoveAttachedAsset,
}: AgentChatInputAttachmentTrayProps): ReactElement {
  return (
    <div className="px-2 pb-1 pt-1">
      <PromptBarAttachedAssetsTray
        assets={assets}
        density="compact"
        isDisabled={isDisabled}
        onBrowseAssets={onBrowseAssets}
        onRemoveAttachedAsset={onRemoveAttachedAsset}
      />
    </div>
  );
}
