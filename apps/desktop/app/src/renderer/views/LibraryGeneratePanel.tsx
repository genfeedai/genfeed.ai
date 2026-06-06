import type {
  IDesktopGenerationJob,
  IDesktopGenerationProviderPublicConfig,
} from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import type { ReactElement } from 'react';

type LibraryGeneratePanelProps = {
  workspaceId: string | null;
  providerConfig: IDesktopGenerationProviderPublicConfig | null;
  assetPrompt: string;
  isGeneratingAsset: boolean;
  assetJob: IDesktopGenerationJob | null;
  assetError: string | null;
  onPromptChange: (value: string) => void;
  onGenerate: () => void;
};

export function LibraryGeneratePanel({
  workspaceId,
  providerConfig,
  assetPrompt,
  isGeneratingAsset,
  assetJob,
  assetError,
  onPromptChange,
  onGenerate,
}: LibraryGeneratePanelProps): ReactElement {
  return (
    <div className="panel-card">
      <div className="ingredient-header">
        <strong className="ingredient-title">Generate Image Asset</strong>
        {providerConfig && (
          <span className="platform-badge">
            {providerConfig.displayName ?? providerConfig.provider}
          </span>
        )}
      </div>
      <div className="library-filters">
        <Input
          className="input-field"
          disabled={!workspaceId || isGeneratingAsset}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder="Prompt"
          type="text"
          value={assetPrompt}
        />
        <Button
          disabled={
            !workspaceId ||
            !assetPrompt.trim() ||
            !providerConfig ||
            isGeneratingAsset
          }
          onClick={onGenerate}
          type="button"
          variant={ButtonVariant.DEFAULT}
        >
          {isGeneratingAsset ? 'Generating…' : 'Generate'}
        </Button>
      </div>
      {assetJob && (
        <p className="muted-text">
          Job {assetJob.status}
          {assetJob.assetIds.length > 0
            ? ` · ${assetJob.assetIds.length} asset`
            : ''}
        </p>
      )}
      {assetError && <div className="error-banner">{assetError}</div>}
    </div>
  );
}
