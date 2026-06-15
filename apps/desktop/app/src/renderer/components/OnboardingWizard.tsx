'use client';

import type {
  DesktopGenerationProviderKind,
  IDesktopGenerationProviderConfig,
  IDesktopSession,
} from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { useEffect, useReducer } from 'react';

interface OnboardingWizardProps {
  onComplete: () => void;
}

const PROVIDER_PRESETS: Record<
  DesktopGenerationProviderKind,
  {
    baseUrl: string;
    displayName: string;
    model: string;
  }
> = {
  'lm-studio': {
    baseUrl: 'http://localhost:1234/v1',
    displayName: 'LM Studio',
    model: 'local-model',
  },
  fal: {
    baseUrl: 'https://queue.fal.run',
    displayName: 'fal.ai',
    model: 'fal-ai/any-llm',
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    displayName: 'Ollama',
    model: 'llama3.1',
  },
  'openai-compatible': {
    baseUrl: 'http://localhost:8000/v1',
    displayName: 'OpenAI-compatible',
    model: 'gpt-4o-mini',
  },
  replicate: {
    baseUrl: 'https://api.replicate.com/v1',
    displayName: 'Replicate',
    model: 'meta/llama-2-70b-chat',
  },
};

interface OnboardingState {
  step: 1 | 2 | 3;
  isConnecting: boolean;
  isTestingProvider: boolean;
  providerStatus: string | null;
  providerKind: DesktopGenerationProviderKind;
  providerBaseUrl: string;
  providerModel: string;
  providerApiKey: string;
}

type OnboardingAction =
  | { type: 'SET_STEP'; step: 1 | 2 | 3 }
  | { type: 'SET_CONNECTING'; isConnecting: boolean }
  | { type: 'BEGIN_TEST' }
  | { type: 'TEST_SUCCESS'; status: string }
  | { type: 'TEST_FAILURE'; status: string }
  | { type: 'TEST_DONE' }
  | { type: 'APPLY_PRESET'; kind: DesktopGenerationProviderKind }
  | { type: 'SET_PROVIDER_BASE_URL'; baseUrl: string }
  | { type: 'SET_PROVIDER_MODEL'; model: string }
  | { type: 'SET_PROVIDER_API_KEY'; apiKey: string };

const initialOnboardingState: OnboardingState = {
  step: 1,
  isConnecting: false,
  isTestingProvider: false,
  providerStatus: null,
  providerKind: 'ollama',
  providerBaseUrl: PROVIDER_PRESETS.ollama.baseUrl,
  providerModel: PROVIDER_PRESETS.ollama.model,
  providerApiKey: '',
};

function onboardingReducer(
  state: OnboardingState,
  action: OnboardingAction,
): OnboardingState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.step };
    case 'SET_CONNECTING':
      return { ...state, isConnecting: action.isConnecting };
    case 'BEGIN_TEST':
      return { ...state, isTestingProvider: true, providerStatus: null };
    case 'TEST_SUCCESS':
      return { ...state, providerStatus: action.status };
    case 'TEST_FAILURE':
      return { ...state, providerStatus: action.status };
    case 'TEST_DONE':
      return { ...state, isTestingProvider: false };
    case 'APPLY_PRESET': {
      const preset = PROVIDER_PRESETS[action.kind];
      return {
        ...state,
        providerKind: action.kind,
        providerBaseUrl: preset.baseUrl,
        providerModel: preset.model,
        providerStatus: null,
      };
    }
    case 'SET_PROVIDER_BASE_URL':
      return { ...state, providerBaseUrl: action.baseUrl };
    case 'SET_PROVIDER_MODEL':
      return { ...state, providerModel: action.model };
    case 'SET_PROVIDER_API_KEY':
      return { ...state, providerApiKey: action.apiKey };
    default:
      return state;
  }
}

export default function OnboardingWizard({
  onComplete,
}: OnboardingWizardProps) {
  const [state, dispatch] = useReducer(
    onboardingReducer,
    initialOnboardingState,
  );

  const {
    step,
    isConnecting,
    isTestingProvider,
    providerStatus,
    providerKind,
    providerBaseUrl,
    providerModel,
    providerApiKey,
  } = state;

  // Subscribe to session changes — when a session arrives, complete onboarding
  useEffect(() => {
    const dispose = window.genfeedDesktop.auth.onDidChangeSession(
      (session: IDesktopSession | null) => {
        if (session) {
          onComplete();
        }
      },
    );
    return dispose;
  }, [onComplete]);

  const handleConnectToCloud = async () => {
    dispatch({ type: 'SET_CONNECTING', isConnecting: true });
    await window.genfeedDesktop.auth.login();
  };

  const applyProviderPreset = (
    nextProviderKind: DesktopGenerationProviderKind,
  ) => {
    dispatch({ type: 'APPLY_PRESET', kind: nextProviderKind });
  };

  const buildProviderPayload = (): IDesktopGenerationProviderConfig => ({
    ...(providerApiKey.trim() ? { apiKey: providerApiKey.trim() } : {}),
    baseUrl: providerBaseUrl.trim(),
    displayName: PROVIDER_PRESETS[providerKind].displayName,
    model: providerModel.trim(),
    provider: providerKind,
  });

  const handleTestAndContinue = async () => {
    dispatch({ type: 'BEGIN_TEST' });

    try {
      const payload = buildProviderPayload();
      const result =
        await window.genfeedDesktop.generation.testProviderConfig(payload);
      const config =
        await window.genfeedDesktop.generation.saveProviderConfig(payload);

      dispatch({
        type: 'TEST_SUCCESS',
        status: `Connected to ${config.displayName ?? config.model} in ${String(
          result.latencyMs,
        )}ms.`,
      });
      onComplete();
    } catch (error) {
      dispatch({
        type: 'TEST_FAILURE',
        status:
          error instanceof Error
            ? error.message
            : 'Provider test failed. Check the endpoint, model, and key.',
      });
    } finally {
      dispatch({ type: 'TEST_DONE' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-xl rounded-2xl bg-gray-900 p-8 shadow-2xl">
        {step === 1 && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-bold text-white">
                Welcome to Genfeed
              </h1>
              <p className="text-sm text-gray-400">
                Genfeed Desktop keeps your workspace local while generation
                defaults to the Genfeed server. Your account uses Genfeed
                credits, so you do not need Replicate, fal.ai, or other provider
                keys on this machine.
              </p>
            </div>
            <Button
              className="w-full"
              onClick={() => dispatch({ type: 'SET_STEP', step: 2 })}
              type="button"
              variant={ButtonVariant.DEFAULT}
            >
              Continue →
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-bold text-white">
                Choose generation access
              </h1>
              <p className="text-sm text-gray-400">
                Connect Genfeed to use server-side generation and paid credits
                by default. You can still add a local or OpenAI-compatible API
                key later if you want to bring your own provider.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Button
                className="w-full"
                disabled={isConnecting}
                onClick={() => void handleConnectToCloud()}
                type="button"
                variant={ButtonVariant.DEFAULT}
              >
                {isConnecting ? 'Connecting...' : 'Use Genfeed credits'}
              </Button>
              <Button
                className="w-full text-gray-400 hover:text-white"
                onClick={() => dispatch({ type: 'SET_STEP', step: 3 })}
                type="button"
                variant={ButtonVariant.UNSTYLED}
              >
                Set up my own local provider instead
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-bold text-white">
                Set up local generation
              </h1>
              <p className="text-sm text-gray-400">
                Add an OpenAI-compatible endpoint or provider key. Genfeed
                stores the key locally and uses this provider when you run
                without Genfeed Cloud.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(
                Object.keys(PROVIDER_PRESETS) as DesktopGenerationProviderKind[]
              ).map((key) => (
                <Button
                  key={key}
                  className={`rounded border border-white/[0.08] px-2 py-2 text-xs ${
                    providerKind === key
                      ? 'border-blue-400/50 text-blue-400'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  onClick={() => applyProviderPreset(key)}
                  type="button"
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                >
                  {PROVIDER_PRESETS[key].displayName}
                </Button>
              ))}
            </div>

            <div className="grid gap-3">
              <Input
                aria-label="Local provider base URL"
                className="h-10 text-sm"
                onChange={(event) =>
                  dispatch({
                    type: 'SET_PROVIDER_BASE_URL',
                    baseUrl: event.target.value,
                  })
                }
                placeholder="http://localhost:11434/v1"
                value={providerBaseUrl}
              />
              <Input
                aria-label="Local provider model"
                className="h-10 text-sm"
                onChange={(event) =>
                  dispatch({
                    type: 'SET_PROVIDER_MODEL',
                    model: event.target.value,
                  })
                }
                placeholder="llama3.1"
                value={providerModel}
              />
              <Input
                aria-label="Local provider API key"
                className="h-10 text-sm"
                onChange={(event) =>
                  dispatch({
                    type: 'SET_PROVIDER_API_KEY',
                    apiKey: event.target.value,
                  })
                }
                placeholder="Optional API key"
                type="password"
                value={providerApiKey}
              />
            </div>

            {providerStatus ? (
              <p className="break-words text-sm text-gray-400">
                {providerStatus}
              </p>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                className="w-full"
                disabled={isTestingProvider}
                onClick={() => void handleTestAndContinue()}
                type="button"
                variant={ButtonVariant.DEFAULT}
              >
                {isTestingProvider ? 'Testing...' : 'Test and continue'}
              </Button>
              <Button
                className="w-full text-gray-400 hover:text-white"
                disabled={isTestingProvider}
                onClick={() => dispatch({ type: 'SET_STEP', step: 2 })}
                type="button"
                variant={ButtonVariant.UNSTYLED}
              >
                Back
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
