'use client';

import { SignIn } from '@clerk/nextjs';
import type { DesktopGenerationProviderKind } from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { Cloud, CloudOff, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useCloudSession } from '@/hooks/useCloudSession';
import { isHybridMode, isLocalOnly } from '@/lib/config/edition';
import { getDesktopBridge, isDesktopShell } from '@/lib/desktop/runtime';

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

function LocalProviderSettings() {
  const [provider, setProvider] =
    useState<DesktopGenerationProviderKind>('ollama');
  const [baseUrl, setBaseUrl] = useState(PROVIDER_PRESETS.ollama.baseUrl);
  const [model, setModel] = useState(PROVIDER_PRESETS.ollama.model);
  const [apiKey, setApiKey] = useState('');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

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

  return (
    <div className="border-t border-white/[0.06] px-3 py-3">
      <div className="mb-2 text-xs font-medium text-foreground/88">
        Local generation
      </div>
      <div className="mb-2 grid grid-cols-3 gap-1">
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
              )}
            >
              {PROVIDER_PRESETS[key].label}
            </Button>
          ),
        )}
      </div>
      <div className="space-y-2">
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
      <div className="mt-2 flex gap-2">
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
    </div>
  );
}

export default function CloudSyncIndicator() {
  const { isConnected } = useCloudSession();
  const [isLaunching, setIsLaunching] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const hybrid = isHybridMode();
  const local = isLocalOnly();
  const desktop = isDesktopShell();

  if (!hybrid && !local) {
    return null;
  }

  const handleConnect = async () => {
    if (!desktop) {
      setShowSignIn(true);
      return;
    }

    const bridge = getDesktopBridge();
    if (!bridge) {
      return;
    }

    setIsLaunching(true);
    try {
      await bridge.auth.login();
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          className="relative inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-background-secondary transition-colors hover:border-border-strong hover:bg-background-tertiary cursor-pointer"
          ariaLabel={isConnected ? 'Cloud connected' : 'Cloud disconnected'}
        >
          {isConnected ? (
            <Cloud className="h-3.5 w-3.5 text-foreground/56" />
          ) : (
            <CloudOff className="h-3.5 w-3.5 text-foreground/56" />
          )}
          <span
            className={cn(
              'absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border border-background',
              isConnected ? 'bg-emerald-400' : 'bg-amber-400',
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-0">
        <div className="p-3">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                'h-2 w-2 rounded-full',
                isConnected ? 'bg-emerald-400' : 'bg-amber-400',
              )}
            />
            <span className="text-xs font-medium text-foreground/88">
              {isConnected
                ? 'Connected to Cloud'
                : local
                  ? 'Local Mode'
                  : 'Offline'}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-foreground/48">
            {isConnected
              ? 'Data syncs automatically with your cloud workspace.'
              : local
                ? 'Running locally. No cloud sync.'
                : 'Sign in to sync with your cloud workspace.'}
          </p>
        </div>
        {hybrid && !isConnected && (
          <div className="border-t border-white/[0.06] px-3 py-2">
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              disabled={desktop && isLaunching}
              onClick={() => void handleConnect()}
              className="w-full rounded px-2 py-1.5 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-500/10 cursor-pointer"
            >
              {desktop && isLaunching
                ? 'Opening Browser...'
                : 'Connect to Cloud'}
            </Button>
          </div>
        )}
        {desktop && <LocalProviderSettings />}
      </PopoverContent>
      {!desktop && showSignIn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative">
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={() => setShowSignIn(false)}
              className="absolute -right-2 -top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-background text-muted-foreground shadow-lg hover:text-foreground cursor-pointer"
              ariaLabel="Close sign in"
            >
              <X className="h-4 w-4" />
            </Button>
            <SignIn
              routing="hash"
              fallbackRedirectUrl="/"
              appearance={{
                elements: {
                  card: 'shadow-2xl',
                  rootBox: 'mx-auto',
                },
              }}
            />
          </div>
        </div>
      )}
    </Popover>
  );
}
