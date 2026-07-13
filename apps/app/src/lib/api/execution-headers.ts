import { useSettingsStore } from '@genfeedai/workflow-ui/stores';

/**
 * Resolve the provider auth headers (Replicate / Fal / HuggingFace BYOK keys)
 * attached to workflow-execute requests, read from the user's local settings.
 *
 * Injected into `packages/workflow-ui` via `WorkflowUIConfig.executionHeaders`
 * so the package's execution store can carry BYOK credentials without depending
 * on the app's settings store. Returns an empty record when no keys are set
 * (e.g. cloud runs, where credentials are resolved server-side).
 */
export function getExecutionProviderHeaders(): Record<string, string> {
  const settings = useSettingsStore.getState();

  return {
    ...settings.getProviderHeader('replicate'),
    ...settings.getProviderHeader('fal'),
    ...settings.getProviderHeader('huggingface'),
  };
}
