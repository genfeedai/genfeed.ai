'use client';

import type { DesktopGenerationProviderKind } from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { useCallback, useEffect, useState } from 'react';
import { getDesktopBridge } from '@/lib/desktop/runtime';

const PROVIDER_PRESETS: Record<
  DesktopGenerationProviderKind,
  { baseUrl: string; label: string; model: string }
> = {
  'lm-studio': {
    baseUrl: 'http://localhost:1234/v1',
    label: 'LM Studio',
    model: 'local-model',
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    label: 'Ollama',
    model: 'llama3.1',
  },
  'openai-compatible': {
    baseUrl: 'http://localhost:8000/v1',
    label: 'OpenAI-compatible',
    model: 'gpt-4o-mini',
  },
};

interface DesktopLocalProviderSettingsProps {
  variant?: 'card' | 'compact';
}

export default function DesktopLocalProviderSettings({
  variant = 'compact',
}: DesktopLocalProviderSettingsProps) {
  const [provider, setProvider] =
    useState<DesktopGenerationProviderKind>('ollama');
  const [baseUrl, setBaseUrl] = useState(PROVIDER_PRESETS.ollama.baseUrl);
  const [model, setModel] = useState(PROVIDER_PRESETS.ollama.model);
  const [apiKey, setApiKey] = useState('');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const isCard = variant === 'card';

  const loadProvider = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge) return;

    const config = await bridge.generation.getProviderConfig();
    if (!config) return;

    setProvider(config.provider);
    setBaseUrl(config.baseUrl);
    setModel(config.model);
    setApiKeyConfigured(config.apiKeyConfigured);
  }, []);

  useEffect(() => {
    void loadProvider().catch((error: unknown) => {
      setStatus(
        error instanceof Error
          ? error.message
          : 'Failed to load local provider.',
      );
    });
  }, [loadProvider]);

  const applyPreset = (nextProvider: DesktopGenerationProviderKind) => {
    const preset = PROVIDER_PRESETS[nextProvider];
    setProvider(nextProvider);
    setBaseUrl(preset.baseUrl);
    setModel(preset.model);
    setStatus(null);
  };

  const providerPayload = () => ({
    ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    baseUrl,
    displayName: PROVIDER_PRESETS[provider].label,
    model,
    provider,
  });

  const handleSave = async () => {
    const bridge = getDesktopBridge();
    if (!bridge) return;

    setIsSaving(true);
    setStatus(null);
    try {
      const config = await bridge.generation.saveProviderConfig(
        providerPayload(),
      );
      setApiKey('');
      setApiKeyConfigured(config.apiKeyConfigured);
      setStatus(`Using ${config.displayName ?? config.model}.`);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : 'Failed to save provider.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    const bridge = getDesktopBridge();
    if (!bridge) return;

    setIsTesting(true);
    setStatus(null);
    try {
      const result = await bridge.generation.testProviderConfig(
        providerPayload(),
      );
      setStatus(`Connected in ${String(result.latencyMs)}ms.`);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : 'Provider test failed.',
      );
    } finally {
      setIsTesting(false);
    }
  };

  const content = (
    <>
      <div className={cn(isCard ? 'mb-4' : 'mb-2')}>
        <div className="text-sm font-medium text-foreground/88">
          Local generation
        </div>
        {isCard ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Genfeed server credits are the default when connected. Configure a
            local OpenAI-compatible provider only for offline or
            bring-your-own-key generation.
          </p>
        ) : null}
      </div>
      <div className="mb-3 grid grid-cols-3 gap-1">
        {(Object.keys(PROVIDER_PRESETS) as DesktopGenerationProviderKind[]).map(
          (key) => (
            <Button
              key={key}
              type="button"
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={() => applyPreset(key)}
              className={cn(
                'rounded border border-white/[0.08] px-1.5 py-1 text-[10px] text-foreground/56',
                provider === key && 'border-blue-400/40 text-blue-400',
                isCard && 'py-2 text-xs',
              )}
            >
              {PROVIDER_PRESETS[key].label}
            </Button>
          ),
        )}
      </div>
      <div className={cn('space-y-2', isCard && 'grid gap-3 sm:grid-cols-3')}>
        <Input
          aria-label="Local provider base URL"
          className="h-8 text-xs"
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder="http://localhost:11434/v1"
          value={baseUrl}
        />
        <Input
          aria-label="Local provider model"
          className="h-8 text-xs"
          onChange={(event) => setModel(event.target.value)}
          placeholder="llama3.1"
          value={model}
        />
        <Input
          aria-label="Local provider API key"
          className="h-8 text-xs"
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={
            apiKeyConfigured ? 'API key saved' : 'Optional local API key'
          }
          type="password"
          value={apiKey}
        />
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          className="rounded px-2 py-1 text-xs"
          disabled={isSaving}
          onClick={() => void handleSave()}
          type="button"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
        <Button
          className="rounded px-2 py-1 text-xs"
          disabled={isTesting}
          onClick={() => void handleTest()}
          type="button"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          {isTesting ? 'Testing...' : 'Test'}
        </Button>
      </div>
      {status && (
        <p className="mt-2 break-words text-[11px] text-foreground/48">
          {status}
        </p>
      )}
    </>
  );

  if (isCard) {
    return <Card className="p-5">{content}</Card>;
  }

  return (
    <div className="border-t border-white/[0.06] px-3 py-3">{content}</div>
  );
}
