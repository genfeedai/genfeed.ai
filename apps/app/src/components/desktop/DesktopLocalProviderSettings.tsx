'use client';

import type { DesktopGenerationProviderKind } from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { useCallback, useEffect, useReducer } from 'react';
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
  const [state, dispatch] = useReducer(providerReducer, initialState);
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

  const loadProvider = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge) return;

    const config = await bridge.generation.getProviderConfig();
    if (!config) return;

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
    void loadProvider().catch((error: unknown) => {
      dispatch({
        type: 'SET_STATUS',
        payload:
          error instanceof Error
            ? error.message
            : 'Failed to load local provider.',
      });
    });
  }, [loadProvider]);

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
    if (!bridge) return;

    dispatch({ type: 'SAVE_START' });
    try {
      const config = await bridge.generation.saveProviderConfig(
        providerPayload(),
      );
      dispatch({
        type: 'SAVE_SUCCESS',
        payload: {
          isApiKeyConfigured: config.apiKeyConfigured,
          statusMessage: `Using ${config.displayName ?? config.model}.`,
        },
      });
    } catch (error) {
      dispatch({
        type: 'SAVE_ERROR',
        payload:
          error instanceof Error ? error.message : 'Failed to save provider.',
      });
    }
  };

  const handleTest = async () => {
    const bridge = getDesktopBridge();
    if (!bridge) return;

    dispatch({ type: 'TEST_START' });
    try {
      const result = await bridge.generation.testProviderConfig(
        providerPayload(),
      );
      dispatch({
        type: 'TEST_SUCCESS',
        payload: `Connected in ${String(result.latencyMs)}ms.`,
      });
    } catch (error) {
      dispatch({
        type: 'TEST_ERROR',
        payload:
          error instanceof Error ? error.message : 'Provider test failed.',
      });
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
          aria-label="Local provider base URL"
          className="h-8 text-xs"
          onChange={(event) =>
            dispatch({ type: 'SET_BASE_URL', payload: event.target.value })
          }
          placeholder="http://localhost:11434/v1"
          value={baseUrl}
        />
        <Input
          aria-label="Local provider model"
          className="h-8 text-xs"
          onChange={(event) =>
            dispatch({ type: 'SET_MODEL', payload: event.target.value })
          }
          placeholder="llama3.1"
          value={model}
        />
        <Input
          aria-label="Local provider API key"
          className="h-8 text-xs"
          onChange={(event) =>
            dispatch({ type: 'SET_API_KEY', payload: event.target.value })
          }
          placeholder={
            isApiKeyConfigured ? 'API key saved' : 'Optional local API key'
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

  return <div className="border-t border-white/[0.06] p-3">{content}</div>;
}
