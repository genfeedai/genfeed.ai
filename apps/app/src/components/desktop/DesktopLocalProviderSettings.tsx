'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { DesktopGenerationProviderKind } from '@genfeedai/contracts/desktop';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useReducer, useState } from 'react';
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
  fal: {
    baseUrl: 'https://queue.fal.run',
    label: 'fal.ai',
    model: 'fal-ai/any-llm',
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
  replicate: {
    baseUrl: 'https://api.replicate.com/v1',
    label: 'Replicate',
    model: 'meta/llama-2-70b-chat',
  },
};

interface DesktopLocalProviderSettingsProps {
  variant?: 'card' | 'compact';
}

type ProviderState = {
  provider: DesktopGenerationProviderKind;
  baseUrl: string;
  model: string;
  apiKey: string;
  isApiKeyConfigured: boolean;
  status: string | null;
  isSaving: boolean;
  isTesting: boolean;
};

type ProviderAction =
  | {
      type: 'LOAD';
      payload: {
        provider: DesktopGenerationProviderKind;
        baseUrl: string;
        model: string;
        isApiKeyConfigured: boolean;
      };
    }
  | { type: 'SET_BASE_URL'; payload: string }
  | { type: 'SET_MODEL'; payload: string }
  | { type: 'SET_API_KEY'; payload: string }
  | { type: 'APPLY_PRESET'; payload: DesktopGenerationProviderKind }
  | { type: 'SAVE_START' }
  | {
      type: 'SAVE_SUCCESS';
      payload: { isApiKeyConfigured: boolean; statusMessage: string };
    }
  | { type: 'SAVE_ERROR'; payload: string }
  | { type: 'TEST_START' }
  | { type: 'TEST_SUCCESS'; payload: string }
  | { type: 'TEST_ERROR'; payload: string }
  | { type: 'SET_STATUS'; payload: string | null };

const initialState: ProviderState = {
  provider: 'ollama',
  baseUrl: PROVIDER_PRESETS.ollama.baseUrl,
  model: PROVIDER_PRESETS.ollama.model,
  apiKey: '',
  isApiKeyConfigured: false,
  status: null,
  isSaving: false,
  isTesting: false,
};

function providerReducer(
  state: ProviderState,
  action: ProviderAction,
): ProviderState {
  switch (action.type) {
    case 'LOAD':
      return {
        ...state,
        provider: action.payload.provider,
        baseUrl: action.payload.baseUrl,
        model: action.payload.model,
        isApiKeyConfigured: action.payload.isApiKeyConfigured,
      };
    case 'SET_BASE_URL':
      return { ...state, baseUrl: action.payload };
    case 'SET_MODEL':
      return { ...state, model: action.payload };
    case 'SET_API_KEY':
      return { ...state, apiKey: action.payload };
    case 'APPLY_PRESET': {
      const preset = PROVIDER_PRESETS[action.payload];
      return {
        ...state,
        provider: action.payload,
        baseUrl: preset.baseUrl,
        model: preset.model,
        status: null,
      };
    }
    case 'SAVE_START':
      return { ...state, isSaving: true, status: null };
    case 'SAVE_SUCCESS':
      return {
        ...state,
        isSaving: false,
        apiKey: '',
        isApiKeyConfigured: action.payload.isApiKeyConfigured,
        status: action.payload.statusMessage,
      };
    case 'SAVE_ERROR':
      return { ...state, isSaving: false, status: action.payload };
    case 'TEST_START':
      return { ...state, isTesting: true, status: null };
    case 'TEST_SUCCESS':
      return { ...state, isTesting: false, status: action.payload };
    case 'TEST_ERROR':
      return { ...state, isTesting: false, status: action.payload };
    case 'SET_STATUS':
      return { ...state, status: action.payload };
    default:
      return state;
  }
}

export default function DesktopLocalProviderSettings({
  variant = 'compact',
}: DesktopLocalProviderSettingsProps) {
  const translate = useTranslations('common.desktop.provider');
  const [state, dispatch] = useReducer(providerReducer, initialState);
  const [isLocalMode, setIsLocalMode] = useState<boolean | null>(null);
  const {
    provider,
    baseUrl,
    model,
    apiKey,
    isApiKeyConfigured,
    status,
    isSaving,
    isTesting,
  } = state;

  const isCard = variant === 'card';

  const loadProvider = useCallback(async (signal: AbortSignal) => {
    const bridge = getDesktopBridge();
    if (!bridge) return;

    const bootstrap = await bridge.app.getBootstrap();
    if (signal.aborted) return;
    setIsLocalMode(bootstrap.isOfflineMode);
    if (!bootstrap.isOfflineMode) return;

    const config = await bridge.generation.getProviderConfig();
    if (signal.aborted || !config) return;

    dispatch({
      type: 'LOAD',
      payload: {
        provider: config.provider,
        baseUrl: config.baseUrl,
        model: config.model,
        isApiKeyConfigured: config.apiKeyConfigured,
      },
    });
  }, []);

  useEffect(() => {
    const abortController = new AbortController();
    void loadProvider(abortController.signal).catch((error: unknown) => {
      if (abortController.signal.aborted) return;
      setIsLocalMode(false);
      dispatch({
        type: 'SET_STATUS',
        payload:
          error instanceof Error
            ? error.message
            : translate('errors.loadFailed'),
      });
    });
    return () => abortController.abort();
  }, [loadProvider, translate]);

  const applyPreset = (nextProvider: DesktopGenerationProviderKind) => {
    dispatch({ type: 'APPLY_PRESET', payload: nextProvider });
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
    if (!bridge || isLocalMode !== true) return;

    dispatch({ type: 'SAVE_START' });
    try {
      const config = await bridge.generation.saveProviderConfig(
        providerPayload(),
      );
      dispatch({
        type: 'SAVE_SUCCESS',
        payload: {
          isApiKeyConfigured: config.apiKeyConfigured,
          statusMessage: translate('status.using', {
            provider: config.displayName ?? config.model,
          }),
        },
      });
    } catch (error) {
      dispatch({
        type: 'SAVE_ERROR',
        payload:
          error instanceof Error
            ? error.message
            : translate('errors.saveFailed'),
      });
    }
  };

  const handleTest = async () => {
    const bridge = getDesktopBridge();
    if (!bridge || isLocalMode !== true) return;

    dispatch({ type: 'TEST_START' });
    try {
      const result = await bridge.generation.testProviderConfig(
        providerPayload(),
      );
      dispatch({
        type: 'TEST_SUCCESS',
        payload: translate('status.connected', {
          latency: String(result.latencyMs),
        }),
      });
    } catch (error) {
      dispatch({
        type: 'TEST_ERROR',
        payload:
          error instanceof Error
            ? error.message
            : translate('errors.testFailed'),
      });
    }
  };

  const handleStartLocalMode = async () => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    dispatch({ type: 'SET_STATUS', payload: translate('status.starting') });
    try {
      await bridge.app.enableOfflineMode();
      window.location.assign('/desktop/local');
    } catch (error) {
      dispatch({
        type: 'SET_STATUS',
        payload:
          error instanceof Error
            ? error.message
            : translate('errors.startFailed'),
      });
    }
  };

  if (isLocalMode !== true) {
    const inactiveContent = (
      <>
        <div className="text-sm font-medium text-foreground/88">
          {translate('inactive.title')}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {translate('inactive.description')}
        </p>
        <Button
          className="mt-3 rounded px-2 py-1 text-xs"
          disabled={isLocalMode === null}
          onClick={() => void handleStartLocalMode()}
          type="button"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          {translate('inactive.action')}
        </Button>
        {status ? (
          <p className="mt-2 break-words text-2xs text-foreground/48">
            {status}
          </p>
        ) : null}
      </>
    );

    return isCard ? (
      <Card bodyClassName="p-5">{inactiveContent}</Card>
    ) : (
      <div className="border-t border-border p-3">{inactiveContent}</div>
    );
  }

  const content = (
    <>
      <div className={cn(isCard ? 'mb-4' : 'mb-2')}>
        <div className="text-sm font-medium text-foreground/88">
          {translate('title')}
        </div>
        {isCard ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {translate('description')}
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
                'rounded border border-border px-1.5 py-1 text-2xs text-foreground/56',
                provider === key && 'border-border bg-hover text-foreground',
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
          aria-label={translate('fields.baseUrl')}
          className="h-8 text-xs"
          onChange={(event) =>
            dispatch({ type: 'SET_BASE_URL', payload: event.target.value })
          }
          placeholder="http://localhost:11434/v1"
          value={baseUrl}
        />
        <Input
          aria-label={translate('fields.model')}
          className="h-8 text-xs"
          onChange={(event) =>
            dispatch({ type: 'SET_MODEL', payload: event.target.value })
          }
          placeholder="llama3.1"
          value={model}
        />
        <Input
          aria-label={translate('fields.apiKey')}
          className="h-8 text-xs"
          onChange={(event) =>
            dispatch({ type: 'SET_API_KEY', payload: event.target.value })
          }
          placeholder={
            isApiKeyConfigured
              ? translate('fields.apiKeySaved')
              : translate('fields.apiKeyOptional')
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
          {isSaving ? translate('actions.saving') : translate('actions.save')}
        </Button>
        <Button
          className="rounded px-2 py-1 text-xs"
          disabled={isTesting}
          onClick={() => void handleTest()}
          type="button"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          {isTesting ? translate('actions.testing') : translate('actions.test')}
        </Button>
      </div>
      {status && (
        <p className="mt-2 break-words text-2xs text-foreground/48">{status}</p>
      )}
    </>
  );

  if (isCard) {
    return <Card bodyClassName="p-5">{content}</Card>;
  }

  return <div className="border-t border-border p-3">{content}</div>;
}
