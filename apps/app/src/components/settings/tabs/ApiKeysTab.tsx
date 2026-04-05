'use client';

import { InfoBox } from '@/components/ui/settings-section';
import { LLM_PROVIDERS, useSettingsStore } from '@/store/settingsStore';
import type { LLMProviderType } from '@/store/settingsStore';
import { Code, Pre } from '@genfeedai/ui';
import { Check, Code as CodeIcon, Eye, EyeOff, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';

const TTS_ENABLED = process.env.NEXT_PUBLIC_TTS_ENABLED === 'true';

interface ApiKeyStatus {
  name: string;
  envVar: string;
  location: 'api' | 'web' | 'both';
  isConfigured: boolean | null;
  description: string;
  docsUrl?: string;
}

const API_KEYS: ApiKeyStatus[] = [
  {
    description: 'Required for image/video generation (Nano Banana, Veo, Kling)',
    docsUrl: 'https://replicate.com/account/api-tokens',
    envVar: 'REPLICATE_API_TOKEN',
    isConfigured: null,
    location: 'api',
    name: 'Replicate',
  },
  {
    description: 'Required for Text-to-Speech (Facecam Avatar template)',
    docsUrl: 'https://elevenlabs.io/app/settings/api-keys',
    envVar: 'ELEVENLABS_API_KEY',
    isConfigured: TTS_ENABLED,
    location: 'both',
    name: 'ElevenLabs',
  },
  {
    description: 'Alternative provider for image/video generation',
    docsUrl: 'https://fal.ai/dashboard/keys',
    envVar: 'FAL_API_KEY',
    isConfigured: null,
    location: 'api',
    name: 'fal.ai',
  },
  {
    description: 'Alternative provider for AI models',
    docsUrl: 'https://huggingface.co/settings/tokens',
    envVar: 'HF_API_TOKEN',
    isConfigured: null,
    location: 'api',
    name: 'Hugging Face',
  },
];

function StatusDot({ status }: { status: boolean | null }) {
  const color = status === true ? 'bg-green-500' : status === false ? 'bg-red-500' : 'bg-gray-400';
  const label =
    status === true ? 'Configured' : status === false ? 'Not configured' : 'Status unknown';

  return <div className={`h-2.5 w-2.5 rounded-full ${color}`} title={label} />;
}

function LLMKeyInput({ provider }: { provider: LLMProviderType }) {
  const info = LLM_PROVIDERS[provider];
  const llm = useSettingsStore((s) => s.llm);
  const setLLMProviderKey = useSettingsStore((s) => s.setLLMProviderKey);
  const setLLMActiveProvider = useSettingsStore((s) => s.setLLMActiveProvider);
  const clearLLMProviderKey = useSettingsStore((s) => s.clearLLMProviderKey);

  const config = llm.providers[provider];
  const isActive = llm.activeProvider === provider;
  const hasKey = !!config.apiKey;

  const [inputValue, setInputValue] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = useCallback(() => {
    if (!inputValue.trim()) return;
    setIsSaving(true);
    setLLMProviderKey(provider, inputValue.trim());
    setInputValue('');
    setIsSaving(false);
  }, [inputValue, provider, setLLMProviderKey]);

  const handleClear = useCallback(() => {
    clearLLMProviderKey(provider);
    setInputValue('');
  }, [provider, clearLLMProviderKey]);

  const handleActivate = useCallback(() => {
    setLLMActiveProvider(provider);
  }, [provider, setLLMActiveProvider]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave]
  );

  const maskedKey = config.apiKey
    ? `${config.apiKey.slice(0, 7)}${'*'.repeat(20)}${config.apiKey.slice(-4)}`
    : '';

  return (
    <div
      className={`rounded-lg border p-3 transition ${
        isActive ? 'border-primary/50 bg-primary/5' : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <StatusDot status={hasKey} />
            <span className="font-medium text-sm text-foreground">{info.name}</span>
            {isActive && (
              <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium">
                Active
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{info.description}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {hasKey && !isActive && (
            <button
              onClick={handleActivate}
              className="text-xs text-primary hover:underline whitespace-nowrap"
            >
              Use this
            </button>
          )}
          <a
            href={info.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline whitespace-nowrap"
          >
            Get key
          </a>
        </div>
      </div>

      {/* Key input or saved state */}
      <div className="mt-2">
        {hasKey ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 bg-secondary/50 rounded px-3 py-1.5 text-xs font-mono text-muted-foreground">
              <span className="truncate">{showKey ? config.apiKey : maskedKey}</span>
              <button
                onClick={() => setShowKey(!showKey)}
                className="shrink-0 text-muted-foreground hover:text-foreground transition"
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <button
              onClick={handleClear}
              className="shrink-0 p-1.5 text-muted-foreground hover:text-destructive transition rounded hover:bg-destructive/10"
              title="Remove key"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={info.keyPlaceholder}
              className="flex-1 px-3 py-1.5 text-xs font-mono bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={handleSave}
              disabled={!inputValue.trim() || isSaving}
              className="shrink-0 p-1.5 bg-primary text-primary-foreground rounded hover:opacity-90 transition disabled:opacity-50"
              title="Save key"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ApiKeysTab() {
  return (
    <div className="space-y-6">
      {/* LLM BYOK Section */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-foreground">AI Assistant (BYOK)</h4>
        <p className="text-xs text-muted-foreground">
          Bring your own API key to power the Workflow Assistant with Claude, GPT, or open-source
          models. Keys are stored in your browser only.
        </p>
        <div className="space-y-2">
          {(Object.keys(LLM_PROVIDERS) as LLMProviderType[]).map((provider) => (
            <LLMKeyInput key={provider} provider={provider} />
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Server-side API Keys */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-foreground">Content Generation (Server)</h4>
        <InfoBox variant="warning" title="Configured via .env files on the server">
          These keys power image, video, and audio generation. Edit your server&apos;s .env files to
          configure them.
        </InfoBox>
        <div className="space-y-2">
          {API_KEYS.map((key) => (
            <div
              key={key.envVar}
              className="flex items-start gap-3 rounded-lg border border-border p-3"
            >
              <div className="mt-0.5">
                <StatusDot status={key.isConfigured} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-foreground">{key.name}</span>
                  <Code className="text-[10px] bg-secondary text-muted-foreground">
                    {key.envVar}
                  </Code>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{key.description}</p>
                {key.isConfigured === false && (
                  <p className="text-xs text-red-500 mt-1">
                    Add to apps/{key.location === 'both' ? 'api/.env & web/.env' : 'api/.env'}
                  </p>
                )}
              </div>
              {key.docsUrl && (
                <a
                  href={key.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline whitespace-nowrap"
                >
                  Get key
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

      <InfoBox title="ElevenLabs Setup" icon={CodeIcon}>
        <p className="text-xs text-muted-foreground">To enable Text-to-Speech, add both:</p>
        <Pre variant="debug" className="mt-2">
          {`# apps/api/.env
ELEVENLABS_API_KEY=your_key_here

# apps/app/.env
NEXT_PUBLIC_TTS_ENABLED=true`}
        </Pre>
        <p className="mt-2 text-xs text-muted-foreground">
          Then restart both the API and web servers.
        </p>
      </InfoBox>
    </div>
  );
}
