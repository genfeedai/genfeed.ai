import type {
  DesktopGenerationProviderKind,
  IDesktopContentRunDraft,
  IDesktopGenerationProviderPublicConfig,
} from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';

import { PROVIDER_PRESETS } from './ConversationProviderPresets';

function formatRelativeDate(value: string): string {
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${String(minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}h ago`;
  const days = Math.floor(hours / 24);
  return `${String(days)}d ago`;
}

type ConversationSidepanelProps = {
  drafts: IDesktopContentRunDraft[];
  isLoadingDrafts: boolean;
  isSavingProvider: boolean;
  isTestingProvider: boolean;
  onApplyProviderPreset: (kind: DesktopGenerationProviderKind) => void;
  onClearProvider: () => Promise<void>;
  onDeleteDraft: (draftId: string) => Promise<void>;
  onNewDraft: () => void;
  onSaveProvider: () => Promise<void>;
  onSelectDraft: (draftId: string) => void;
  onTestProvider: () => Promise<void>;
  providerApiKey: string;
  providerBaseUrl: string;
  providerConfig: IDesktopGenerationProviderPublicConfig | null;
  providerKind: DesktopGenerationProviderKind;
  providerModel: string;
  providerStatus: string | null;
  selectedDraftId: string | null;
  workspaceId: string | null;
  onProviderApiKeyChange: (value: string) => void;
  onProviderBaseUrlChange: (value: string) => void;
  onProviderModelChange: (value: string) => void;
};

export function ConversationSidepanel({
  drafts,
  isLoadingDrafts,
  isSavingProvider,
  isTestingProvider,
  onApplyProviderPreset,
  onClearProvider,
  onDeleteDraft,
  onNewDraft,
  onSaveProvider,
  onSelectDraft,
  onTestProvider,
  providerApiKey,
  providerBaseUrl,
  providerConfig,
  providerKind,
  providerModel,
  providerStatus,
  selectedDraftId,
  workspaceId,
  onProviderApiKeyChange,
  onProviderBaseUrlChange,
  onProviderModelChange,
}: ConversationSidepanelProps) {
  return (
    <aside className="conversation-sidepanel panel-card">
      <div className="conversation-panel-header">
        <h3>Saved Runs</h3>
        <Button
          className="small"
          onClick={onNewDraft}
          type="button"
          variant={ButtonVariant.GHOST}
        >
          New
        </Button>
      </div>

      {!workspaceId && (
        <p className="empty-state compact">
          Open a workspace to create and persist content runs.
        </p>
      )}

      {workspaceId && isLoadingDrafts && (
        <p className="muted-text">Loading drafts…</p>
      )}

      {workspaceId && drafts.length === 0 && !isLoadingDrafts && (
        <p className="empty-state compact">
          No content runs yet. Save a draft or create one from a trend.
        </p>
      )}

      <div className="draft-list">
        {drafts.map((draft) => (
          <Button
            className={`draft-list-item ${
              selectedDraftId === draft.id ? 'active' : ''
            }`}
            key={draft.id}
            onClick={() => onSelectDraft(draft.id)}
            type="button"
            variant={ButtonVariant.UNSTYLED}
          >
            <span className="draft-list-title">{draft.title}</span>
            <span className="draft-list-meta">
              <span className={`status-badge status-${draft.status}`}>
                {draft.status}
              </span>
              <span>{formatRelativeDate(draft.updatedAt)}</span>
            </span>
            <span className="draft-list-submeta">
              {draft.platform} · {draft.type}
            </span>
            <span className="draft-list-actions">
              <span>{draft.sourceType === 'trend' ? 'Trend' : 'Prompt'}</span>
              <Button
                aria-label={`Delete draft ${draft.title}`}
                className="draft-list-delete"
                onClick={(event) => {
                  event.stopPropagation();
                  void onDeleteDraft(draft.id);
                }}
                type="button"
                variant={ButtonVariant.GHOST}
              >
                ✕
              </Button>
            </span>
          </Button>
        ))}
      </div>

      <div className="provider-panel" id="desktop-provider-panel">
        <div className="conversation-panel-header">
          <h3>Local Provider</h3>
          <span
            className={`status-badge ${
              providerConfig ? 'status-active' : 'status-pending'
            }`}
          >
            {providerConfig ? 'Ready' : 'Optional'}
          </span>
        </div>
        <p className="muted-text provider-status">
          Genfeed server credits are the default when connected. Configure a
          local provider only for offline or bring-your-own-key generation.
        </p>

        <div className="provider-preset-group">
          {(
            Object.keys(PROVIDER_PRESETS) as DesktopGenerationProviderKind[]
          ).map((presetKey) => (
            <Button
              className={`provider-preset ${
                providerKind === presetKey ? 'active' : ''
              }`}
              key={presetKey}
              onClick={() => onApplyProviderPreset(presetKey)}
              type="button"
              variant={ButtonVariant.UNSTYLED}
            >
              {PROVIDER_PRESETS[presetKey].displayName}
            </Button>
          ))}
        </div>

        <label className="provider-field" htmlFor="desktop-provider-url">
          <span>Base URL</span>
          <Input
            id="desktop-provider-url"
            onChange={(event) => onProviderBaseUrlChange(event.target.value)}
            placeholder="http://localhost:11434/v1"
            type="url"
            value={providerBaseUrl}
          />
        </label>

        <label className="provider-field" htmlFor="desktop-provider-model">
          <span>Model</span>
          <Input
            id="desktop-provider-model"
            onChange={(event) => onProviderModelChange(event.target.value)}
            placeholder="llama3.1"
            type="text"
            value={providerModel}
          />
        </label>

        <label className="provider-field" htmlFor="desktop-provider-api-key">
          <span>
            API key
            {providerConfig?.apiKeyConfigured ? ' saved' : ''}
          </span>
          <Input
            id="desktop-provider-api-key"
            onChange={(event) => onProviderApiKeyChange(event.target.value)}
            placeholder={
              providerConfig?.apiKeyConfigured
                ? 'Leave blank to keep saved key'
                : 'Optional for local providers'
            }
            type="password"
            value={providerApiKey}
          />
        </label>

        <div className="provider-actions">
          <Button
            className="small"
            disabled={isSavingProvider}
            onClick={() => void onSaveProvider()}
            type="button"
            variant={ButtonVariant.GHOST}
          >
            {isSavingProvider ? 'Saving…' : 'Save'}
          </Button>
          <Button
            className="small"
            disabled={isTestingProvider}
            onClick={() => void onTestProvider()}
            type="button"
            variant={ButtonVariant.GHOST}
          >
            {isTestingProvider ? 'Testing…' : 'Test'}
          </Button>
          <Button
            className="small"
            onClick={() => void onClearProvider()}
            type="button"
            variant={ButtonVariant.GHOST}
          >
            Clear
          </Button>
        </div>

        {providerStatus && (
          <p className="muted-text provider-status">{providerStatus}</p>
        )}
      </div>
    </aside>
  );
}
