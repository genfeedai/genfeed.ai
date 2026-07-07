import type {
  DesktopGenerationProviderKind,
  IDesktopContentRunDraft,
  IDesktopGenerationProviderPublicConfig,
} from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';

import { LocalProviderSettingsPanel } from './LocalProviderSettingsPanel';

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
  onOpenProviderKeys: () => Promise<void>;
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
  onOpenProviderKeys,
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
          <div
            className={`draft-list-item ${
              selectedDraftId === draft.id ? 'active' : ''
            }`}
            key={draft.id}
          >
            <Button
              className="draft-list-main"
              onClick={() => onSelectDraft(draft.id)}
              type="button"
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
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
              </span>
            </Button>
            <Button
              aria-label={`Delete draft ${draft.title}`}
              className="draft-list-delete"
              onClick={() => {
                void onDeleteDraft(draft.id);
              }}
              type="button"
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            >
              ✕
            </Button>
          </div>
        ))}
      </div>

      <LocalProviderSettingsPanel
        isSavingProvider={isSavingProvider}
        isTestingProvider={isTestingProvider}
        onApplyProviderPreset={onApplyProviderPreset}
        onClearProvider={onClearProvider}
        onOpenProviderKeys={onOpenProviderKeys}
        onProviderApiKeyChange={onProviderApiKeyChange}
        onProviderBaseUrlChange={onProviderBaseUrlChange}
        onProviderModelChange={onProviderModelChange}
        onSaveProvider={onSaveProvider}
        onTestProvider={onTestProvider}
        providerApiKey={providerApiKey}
        providerBaseUrl={providerBaseUrl}
        providerConfig={providerConfig}
        providerKind={providerKind}
        providerModel={providerModel}
        providerStatus={providerStatus}
      />
    </aside>
  );
}
