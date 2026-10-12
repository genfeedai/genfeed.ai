import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { NativeHostProviderStatus } from '@genfeedai/contracts/api-types/contracts/native-host.contract';
import {
  isNativeHostProviderId,
  NATIVE_HOST_PROVIDER_LABELS,
} from '@genfeedai/contracts/constants';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import {
  detectNativeHost,
  NativeHostError,
} from '~services/native-host.service';
import { useSettingsStore } from '~store/use-settings-store';

const OFF_VALUE = 'off';

type DetectionState =
  | { status: 'checking' }
  | { status: 'ready'; providers: NativeHostProviderStatus[] }
  | { status: 'failed'; message: string };

/**
 * Chooses the provider on this computer that runs a text action when Genfeed
 * cloud definitively fails. Genfeed cloud stays first; nothing runs locally
 * until a provider is chosen here. Checking this computer only lists what is
 * installed; it never runs a provider or sends a prompt.
 */
export function LocalFallbackSettings(): ReactElement {
  const providerId = useSettingsStore((s) => s.localFallbackProviderId);
  const setProvider = useSettingsStore((s) => s.setLocalFallbackProvider);
  const [detection, setDetection] = useState<DetectionState>({
    status: 'checking',
  });

  const check = useCallback(async (signal: AbortSignal) => {
    setDetection({ status: 'checking' });
    try {
      const { providers } = await detectNativeHost();
      if (!signal.aborted) setDetection({ providers, status: 'ready' });
    } catch (error) {
      if (signal.aborted) return;
      setDetection({
        message:
          error instanceof NativeHostError
            ? error.message
            : 'Could not check this computer.',
        status: 'failed',
      });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void check(controller.signal);
    return () => controller.abort();
  }, [check]);

  const available =
    detection.status === 'ready'
      ? detection.providers.filter((provider) => provider.isAvailable)
      : [];
  const isChosenMissing =
    providerId !== null &&
    detection.status === 'ready' &&
    !available.some((provider) => provider.id === providerId);

  const handleChange = (value: string): void => {
    if (value === OFF_VALUE) setProvider(null);
    else if (isNativeHostProviderId(value)) setProvider(value);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <label
            className="text-sm text-foreground"
            htmlFor="extension-local-fallback"
          >
            Local fallback
          </label>
          <p className="text-2xs text-muted-foreground">
            Genfeed is always tried first. If it is down, at its request limit
            or out of credits, the same action can run on this computer.
          </p>
        </div>
        <Select value={providerId ?? OFF_VALUE} onValueChange={handleChange}>
          <SelectTrigger
            id="extension-local-fallback"
            aria-label="Local fallback"
            className="w-36"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={OFF_VALUE}>Off (Genfeed only)</SelectItem>
            {providerId !== null &&
            !available.some((provider) => provider.id === providerId) ? (
              <SelectItem value={providerId}>
                {NATIVE_HOST_PROVIDER_LABELS[providerId]}
              </SelectItem>
            ) : null}
            {available.map((provider) => (
              <SelectItem key={provider.id} value={provider.id}>
                {provider.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {detection.status === 'checking' ? (
        <p role="status" className="text-2xs text-muted-foreground">
          Checking this computer…
        </p>
      ) : null}

      {detection.status === 'failed' ? (
        <div className="space-y-2">
          <p role="alert" className="text-xs text-destructive">
            {detection.message}
          </p>
          <Button
            type="button"
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            onClick={() => {
              void check(new AbortController().signal);
            }}
          >
            Check again
          </Button>
        </div>
      ) : null}

      {detection.status === 'ready' && available.length === 0 ? (
        <p className="text-2xs text-muted-foreground">
          No Claude Code, Codex or Gemini CLI and no saved API key were found.
          Install one, or run <code>gf host provider add</code>, then check
          again.
        </p>
      ) : null}

      {isChosenMissing ? (
        <p role="alert" className="text-xs text-destructive">
          {providerId
            ? NATIVE_HOST_PROVIDER_LABELS[providerId]
            : 'The provider'}{' '}
          was not found on this computer. Fallback will fail until it is
          available.
        </p>
      ) : null}

      {detection.status === 'ready' ? (
        <Button
          type="button"
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          onClick={() => {
            void check(new AbortController().signal);
          }}
        >
          Check again
        </Button>
      ) : null}
    </div>
  );
}
