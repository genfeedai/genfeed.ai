import type {
  DesktopGenerationProviderKind,
  IDesktopGenerationProviderPublicConfig,
} from '@genfeedai/desktop-contracts';
import { useCallback, useEffect, useState } from 'react';

import { PROVIDER_PRESETS } from './ConversationProviderPresets';

const PROVIDER_KEYS_PATH = '/settings/api-keys?source=desktop';

export function useLocalProviderSettings() {
  const [providerConfig, setProviderConfig] =
    useState<IDesktopGenerationProviderPublicConfig | null>(null);
  const [providerKind, setProviderKind] =
    useState<DesktopGenerationProviderKind>('ollama');
  const [providerBaseUrl, setProviderBaseUrl] = useState(
    PROVIDER_PRESETS.ollama.baseUrl,
  );
  const [providerModel, setProviderModel] = useState(
    PROVIDER_PRESETS.ollama.model,
  );
  const [providerApiKey, setProviderApiKey] = useState('');
  const [providerDisplayName, setProviderDisplayName] = useState(
    PROVIDER_PRESETS.ollama.displayName,
  );
  const [providerStatus, setProviderStatus] = useState<string | null>(null);
  const [isSavingProvider, setIsSavingProvider] = useState(false);
  const [isTestingProvider, setIsTestingProvider] = useState(false);

  const loadProviderConfig = useCallback(async () => {
    const nextConfig =
      await window.genfeedDesktop.generation.getProviderConfig();
    setProviderConfig(nextConfig);

    if (!nextConfig) {
      return;
    }

    setProviderKind(nextConfig.provider);
    setProviderBaseUrl(nextConfig.baseUrl);
    setProviderModel(nextConfig.model);
    setProviderDisplayName(
      nextConfig.displayName ??
        PROVIDER_PRESETS[nextConfig.provider].displayName,
    );
  }, []);

  useEffect(() => {
    void loadProviderConfig().catch((nextError: unknown) => {
      setProviderStatus(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to load local provider.',
      );
    });
  }, [loadProviderConfig]);

  const applyProviderPreset = useCallback(
    (nextProviderKind: DesktopGenerationProviderKind) => {
      const preset = PROVIDER_PRESETS[nextProviderKind];
      setProviderKind(nextProviderKind);
      setProviderBaseUrl(preset.baseUrl);
      setProviderModel(preset.model);
      setProviderDisplayName(preset.displayName);
      setProviderStatus(null);
    },
    [],
  );

  const buildProviderPayload = useCallback(
    () => ({
      ...(providerApiKey.trim()
        ? {
            apiKey: providerApiKey.trim(),
          }
        : {}),
      baseUrl: providerBaseUrl.trim(),
      displayName: providerDisplayName.trim() || undefined,
      model: providerModel.trim(),
      provider: providerKind,
    }),
    [
      providerApiKey,
      providerBaseUrl,
      providerDisplayName,
      providerKind,
      providerModel,
    ],
  );

  const handleSaveProvider = useCallback(async () => {
    setIsSavingProvider(true);
    setProviderStatus(null);

    try {
      const savedConfig =
        await window.genfeedDesktop.generation.saveProviderConfig(
          buildProviderPayload(),
        );
      setProviderConfig(savedConfig);
      setProviderApiKey('');
      setProviderStatus(
        `Using ${savedConfig.displayName ?? savedConfig.model}.`,
      );
    } catch (nextError) {
      setProviderStatus(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to save local provider.',
      );
    } finally {
      setIsSavingProvider(false);
    }
  }, [buildProviderPayload]);

  const handleTestProvider = useCallback(async () => {
    setIsTestingProvider(true);
    setProviderStatus(null);

    try {
      const result = await window.genfeedDesktop.generation.testProviderConfig(
        buildProviderPayload(),
      );
      setProviderStatus(`Connected in ${String(result.latencyMs)}ms.`);
    } catch (nextError) {
      setProviderStatus(
        nextError instanceof Error
          ? nextError.message
          : 'Local provider test failed.',
      );
    } finally {
      setIsTestingProvider(false);
    }
  }, [buildProviderPayload]);

  const handleClearProvider = useCallback(async () => {
    await window.genfeedDesktop.generation.clearProviderConfig();
    setProviderConfig(null);
    setProviderApiKey('');
    setProviderStatus('Local provider cleared.');
  }, []);

  const handleOpenProviderKeys = useCallback(async () => {
    await window.genfeedDesktop.app.openExternalPath(PROVIDER_KEYS_PATH);
  }, []);

  return {
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
  };
}
