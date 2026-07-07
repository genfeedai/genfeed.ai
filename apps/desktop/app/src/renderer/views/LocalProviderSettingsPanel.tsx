import type {
  DesktopGenerationProviderKind,
  IDesktopGenerationProviderPublicConfig,
} from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';

import { PROVIDER_PRESETS } from './ConversationProviderPresets';

interface LocalProviderSettingsPanelProps {
  isSavingProvider: boolean;
  isTestingProvider: boolean;
  onApplyProviderPreset: (kind: DesktopGenerationProviderKind) => void;
  onClearProvider: () => Promise<void>;
  onOpenProviderKeys?: () => Promise<void> | void;
  onProviderApiKeyChange: (value: string) => void;
  onProviderBaseUrlChange: (value: string) => void;
  onProviderModelChange: (value: string) => void;
  onSaveProvider: () => Promise<void>;
  onTestProvider: () => Promise<void>;
  providerApiKey: string;
  providerBaseUrl: string;
  providerConfig: IDesktopGenerationProviderPublicConfig | null;
  providerKind: DesktopGenerationProviderKind;
  providerModel: string;
  providerStatus: string | null;
}

export function LocalProviderSettingsPanel({
  isSavingProvider,
  isTestingProvider,
  onApplyProviderPreset,
  onClearProvider,
  onOpenProviderKeys,
  onProviderApiKeyChange,
  onProviderBaseUrlChange,
  onProviderModelChange,
  onSaveProvider,
  onTestProvider,
  providerApiKey,
  providerBaseUrl,
  providerConfig,
  providerKind,
  providerModel,
  providerStatus,
}: LocalProviderSettingsPanelProps) {
  return (
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
        Genfeed server credits are the default when connected. Configure a local
        provider only for offline or bring-your-own-key generation.
      </p>

      <div className="provider-preset-group">
        {(Object.keys(PROVIDER_PRESETS) as DesktopGenerationProviderKind[]).map(
          (presetKey) => (
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
          ),
        )}
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
          {isSavingProvider ? 'Saving...' : 'Save'}
        </Button>
        <Button
          className="small"
          disabled={isTestingProvider}
          onClick={() => void onTestProvider()}
          type="button"
          variant={ButtonVariant.GHOST}
        >
          {isTestingProvider ? 'Testing...' : 'Test'}
        </Button>
        <Button
          className="small"
          onClick={() => void onClearProvider()}
          type="button"
          variant={ButtonVariant.GHOST}
        >
          Clear
        </Button>
        {onOpenProviderKeys ? (
          <Button
            className="small"
            onClick={() => void onOpenProviderKeys()}
            type="button"
            variant={ButtonVariant.GHOST}
          >
            Provider keys
          </Button>
        ) : null}
      </div>

      {providerStatus && (
        <p className="muted-text provider-status">{providerStatus}</p>
      )}
    </div>
  );
}
