'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import Button from '@ui/buttons/base/Button';
import { Input } from '@ui/primitives/input';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  XCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { DetectedTools } from '@/lib/api/setup';
import { setupApi } from '@/lib/api/setup';
import { logger } from '@/lib/logger';

// =============================================================================
// TYPES
// =============================================================================

interface ToolDisplayItem {
  label: string;
  installed: boolean;
  installedText: string;
  missingText: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

function OnboardingContent() {
  const router = useRouter();

  // Form state
  const [replicateApiKey, setReplicateApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [keyValid, setKeyValid] = useState<boolean | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [detectedTools, setDetectedTools] = useState<DetectedTools | null>(
    null,
  );

  // Fetch detected tools on mount
  useEffect(() => {
    const controller = new AbortController();
    setupApi
      .detectTools(controller.signal)
      .then(setDetectedTools)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError')
          return;
        logger.error('Failed to detect tools', error, {
          context: 'OnboardingContent',
        });
      });
    return () => controller.abort();
  }, []);

  async function handleValidate() {
    if (!replicateApiKey.trim()) return;

    setIsValidating(true);
    setKeyValid(null);
    setValidationMessage(null);

    try {
      const result = await setupApi.validateKey({
        apiKey: replicateApiKey.trim(),
        provider: 'replicate',
      });
      setKeyValid(result.valid);
      setValidationMessage(
        result.message ?? (result.valid ? 'Key is valid' : 'Key is invalid'),
      );
    } catch (error: unknown) {
      setKeyValid(false);
      setValidationMessage(
        'Validation failed. Check your connection and try again.',
      );
      logger.error('Key validation failed', error, {
        context: 'OnboardingContent',
      });
    } finally {
      setIsValidating(false);
    }
  }

  async function handleSubmit() {
    if (!replicateApiKey.trim() || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // Validate first if not yet validated
      if (keyValid === null) {
        const result = await setupApi.validateKey({
          apiKey: replicateApiKey.trim(),
          provider: 'replicate',
        });
        setKeyValid(result.valid);
        setValidationMessage(
          result.message ?? (result.valid ? 'Key is valid' : 'Key is invalid'),
        );

        if (!result.valid) {
          setIsSubmitting(false);
          return;
        }
      } else if (keyValid === false) {
        setIsSubmitting(false);
        return;
      }

      await setupApi.complete({ replicateApiKey: replicateApiKey.trim() });

      // Sync to settings store
      const { useSettingsStore } = await import('@/store/settingsStore');
      useSettingsStore
        .getState()
        .setProviderKey('replicate', replicateApiKey.trim());
      useSettingsStore.getState().setHasSeenWelcome(true);

      router.push('/');
    } catch (error: unknown) {
      logger.error('Setup completion failed', error, {
        context: 'OnboardingContent',
      });
      setValidationMessage('Setup failed. Please try again.');
      setIsSubmitting(false);
    }
  }

  // Reset validation when key changes
  function handleKeyChange(value: string) {
    setReplicateApiKey(value);
    if (keyValid !== null) {
      setKeyValid(null);
      setValidationMessage(null);
    }
  }

  const toolItems: ToolDisplayItem[] = detectedTools
    ? [
        {
          installed: detectedTools.codex.installed,
          installedText: 'installed',
          label: 'Codex CLI',
          missingText: 'not found',
        },
        {
          installed: detectedTools.claude.installed,
          installedText: 'installed',
          label: 'Claude CLI',
          missingText: 'not found',
        },
        {
          installed: detectedTools.anthropic.installed,
          installedText: 'available',
          label: 'ANTHROPIC_API_KEY',
          missingText: 'not set',
        },
      ]
    : [];

  return (
    <div className="w-full max-w-md px-6">
      {/* Header */}
      <div className="mb-8 flex flex-col items-center text-center">
        <img
          src="https://cdn.genfeed.ai/assets/branding/logo-white.png"
          alt="Genfeed"
          className="h-10 w-10"
        />
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-[var(--foreground)]">
          Get started
        </h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Add your Replicate API key to start generating content.
        </p>
      </div>

      {/* Replicate Key Section */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <label
            htmlFor="replicate-key"
            className="text-sm font-medium text-[var(--foreground)]"
          >
            Replicate API Key
          </label>
          <span className="text-xs text-[var(--muted-foreground)]">
            (required)
          </span>
        </div>

        <div className="relative">
          <Input
            id="replicate-key"
            type={showKey ? 'text' : 'password'}
            value={replicateApiKey}
            onChange={(e) => handleKeyChange(e.target.value)}
            placeholder="r8_..."
            className="pr-10"
            autoComplete="off"
          />
          <Button
            onClick={() => setShowKey((prev) => !prev)}
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
            ariaLabel={showKey ? 'Hide API key' : 'Show API key'}
          >
            {showKey ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Validation status */}
        {validationMessage && (
          <div className="flex items-center gap-1.5 text-xs">
            {keyValid ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <XCircle className="h-3.5 w-3.5 text-red-500" />
            )}
            <span className={keyValid ? 'text-green-500' : 'text-red-500'}>
              {validationMessage}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <a
            href="https://replicate.com/account/api-tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
          >
            Get your key &rarr;
          </a>
          <Button
            variant={ButtonVariant.OUTLINE}
            size={ButtonSize.SM}
            onClick={handleValidate}
            isDisabled={!replicateApiKey.trim() || isValidating}
          >
            {isValidating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Validate
          </Button>
        </div>
      </div>

      {/* Divider + AI Tools Section */}
      <div className="mt-8">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-[var(--border)]" />
          <span className="text-xs font-medium text-[var(--muted-foreground)]">
            AI Tools (detected)
          </span>
          <div className="h-px flex-1 bg-[var(--border)]" />
        </div>

        {detectedTools ? (
          <ul className="mt-4 space-y-2.5">
            {toolItems.map((tool) => (
              <li key={tool.label} className="flex items-center gap-2 text-sm">
                {tool.installed ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                <span className="text-[var(--foreground)]">{tool.label}</span>
                <span className="text-xs text-[var(--muted-foreground)]">
                  {tool.installed ? tool.installedText : tool.missingText}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[var(--muted-foreground)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Detecting tools...
          </div>
        )}

        <p className="mt-3 text-xs text-[var(--muted-foreground)]">
          These enable AI-assisted workflow building. No action needed if
          installed.
        </p>
      </div>

      {/* Submit */}
      <Button
        className="mt-8 w-full"
        size={ButtonSize.LG}
        onClick={handleSubmit}
        isDisabled={!replicateApiKey.trim() || isSubmitting}
      >
        {isSubmitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            Start Creating
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>
    </div>
  );
}

export { OnboardingContent };
