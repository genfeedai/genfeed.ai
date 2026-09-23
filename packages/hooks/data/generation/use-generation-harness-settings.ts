'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import type {
  GenerationHarnessSettings,
  UpdateGenerationHarnessSettings,
} from '@genfeedai/contracts/interfaces/content/generation-harness.interface';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { GenerationHarnessService } from '@services/ai/generation-harness.service';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useGenerationHarnessSettings(isOpen: boolean) {
  const { brandId, organizationId } = useBrand();
  const getService = useAuthedService((token) =>
    GenerationHarnessService.getInstance(token),
  );
  const [settings, setSettings] = useState<GenerationHarnessSettings | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const requestRef = useRef<AbortController | null>(null);
  const savingRef = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: revision explicitly refreshes saved settings after focus or retry.
  useEffect(() => {
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    savingRef.current = false;
    setSettings(null);
    setIsSaving(false);
    setError(null);
    setIsLoading(isOpen && !!organizationId);
    if (isOpen && !organizationId)
      setError('Choose an organization to edit prompt enhancement settings.');
    if (!isOpen || !organizationId) return () => controller.abort();

    async function load() {
      try {
        const service = await getService();
        if (controller.signal.aborted) return;
        const value = await service.getSettings(brandId, controller.signal);
        if (!controller.signal.aborted) setSettings(value);
      } catch {
        if (!controller.signal.aborted)
          setError('Could not load prompt enhancement settings.');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [brandId, getService, isOpen, organizationId, revision]);

  useEffect(() => {
    if (!isOpen) return;
    const refresh = () => {
      if (!savingRef.current) setRevision((value) => value + 1);
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [isOpen]);

  const save = useCallback(
    async (
      scope: UpdateGenerationHarnessSettings['scope'],
      isEnabled: boolean | null,
    ) => {
      if (
        !organizationId ||
        !isOpen ||
        isLoading ||
        savingRef.current ||
        !settings
      )
        return;
      const controller = new AbortController();
      requestRef.current?.abort();
      requestRef.current = controller;
      savingRef.current = true;
      setIsSaving(true);
      setError(null);
      try {
        const service = await getService();
        if (controller.signal.aborted) return;
        await service.updateSettings(
          { scope, isEnabled, ...(brandId ? { brandId } : {}) },
          controller.signal,
        );
        const value = await service.getSettings(brandId, controller.signal);
        if (!controller.signal.aborted) setSettings(value);
      } catch {
        if (!controller.signal.aborted)
          setError(
            'Could not confirm the saved setting. Refresh to check, then try again.',
          );
      } finally {
        if (!controller.signal.aborted) {
          savingRef.current = false;
          setIsSaving(false);
        }
      }
    },
    [brandId, getService, isLoading, isOpen, organizationId, settings],
  );

  useEffect(
    () => () => {
      requestRef.current?.abort();
    },
    [],
  );

  return {
    brandId,
    error,
    isLoading,
    isSaving,
    refresh: () => setRevision((value) => value + 1),
    save,
    settings,
  };
}
