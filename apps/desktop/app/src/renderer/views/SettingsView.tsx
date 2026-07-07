import { LocalProviderSettingsPanel } from './LocalProviderSettingsPanel';
import { useLocalProviderSettings } from './useLocalProviderSettings';

export function SettingsView() {
  const {
    applyProviderPreset,
    handleClearProvider,
    handleOpenProviderKeys,
    handleSaveProvider,
    handleTestProvider,
    isSavingProvider,
    isTestingProvider,
    providerApiKey,
    providerBaseUrl,
    providerConfig,
    providerKind,
    providerModel,
    providerStatus,
    setProviderApiKey,
    setProviderBaseUrl,
    setProviderModel,
  } = useLocalProviderSettings();

  return (
    <section className="settings-view">
      <div className="view-header">
        <div>
          <h2>Settings</h2>
          <p className="muted-text">
            Local provider configuration for desktop generation.
          </p>
        </div>
      </div>

      <div className="settings-content">
        <LocalProviderSettingsPanel
          isSavingProvider={isSavingProvider}
          isTestingProvider={isTestingProvider}
          onApplyProviderPreset={applyProviderPreset}
          onClearProvider={handleClearProvider}
          onOpenProviderKeys={handleOpenProviderKeys}
          onProviderApiKeyChange={setProviderApiKey}
          onProviderBaseUrlChange={setProviderBaseUrl}
          onProviderModelChange={setProviderModel}
          onSaveProvider={handleSaveProvider}
          onTestProvider={handleTestProvider}
          providerApiKey={providerApiKey}
          providerBaseUrl={providerBaseUrl}
          providerConfig={providerConfig}
          providerKind={providerKind}
          providerModel={providerModel}
          providerStatus={providerStatus}
        />
      </div>
    </section>
  );
}
