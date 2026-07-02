'use client';

import { createContext, type ReactNode, use, useEffect } from 'react';
import {
  configureExecutionHeaders,
  configureExecutionHttpClient,
} from '../stores/execution/executionApi';
import { configureWorkflowLogger } from '../stores/executionLogger';
import { configurePromptLibrary } from '../stores/promptLibraryStore';
import { configureApplyEditOperations } from '../stores/workflow/applyEditOperations';
import { configureWorkflowPersistence } from '../stores/workflow/workflowPersistence';
import type { WorkflowUIConfig } from './types';

const WorkflowUIContext = createContext<WorkflowUIConfig>({});

/**
 * Provider that injects app-specific dependencies into workflow-ui components.
 *
 * Nodes use `useWorkflowUIConfig()` to access:
 * - File upload service (ImageInputNode, VideoInputNode)
 * - Model schema service (AI gen nodes)
 * - Prompt library service (PromptNode)
 * - ModelBrowserModal component (ImageGenNode, VideoGenNode, LLMNode)
 * - PromptPicker component (PromptNode)
 *
 * Components gracefully degrade when services are not provided.
 */
export function WorkflowUIProvider({
  config,
  children,
}: {
  config: WorkflowUIConfig;
  children: ReactNode;
}) {
  // Configure the prompt library store with the injected API service
  useEffect(() => {
    if (config.promptLibrary) {
      configurePromptLibrary(config.promptLibrary);
    }
  }, [config.promptLibrary]);

  // Register the execution-store logger (SSE failures, failed runs). Resets to
  // a no-op when unset so the package stays observable-agnostic standalone.
  useEffect(() => {
    configureWorkflowLogger(config.logger);
  }, [config.logger]);

  // Register the execution HTTP client + provider auth headers. Both reset to
  // the package's bare-fetch / no-header defaults when unset.
  useEffect(() => {
    configureExecutionHttpClient(config.executionHttpClient);
  }, [config.executionHttpClient]);

  useEffect(() => {
    configureExecutionHeaders(config.executionHeaders);
  }, [config.executionHeaders]);

  // Register the workflow persistence backend + graph edit-operation applier.
  // Both reset to their defaults (throw / no-op) when unset.
  useEffect(() => {
    configureWorkflowPersistence(config.workflowPersistence);
  }, [config.workflowPersistence]);

  useEffect(() => {
    configureApplyEditOperations(config.applyEditOperations);
  }, [config.applyEditOperations]);

  return (
    <WorkflowUIContext.Provider value={config}>
      {children}
    </WorkflowUIContext.Provider>
  );
}

/**
 * Hook to access the workflow UI configuration from the provider.
 * Returns an empty config object if used outside a WorkflowUIProvider.
 */
export function useWorkflowUIConfig(): WorkflowUIConfig {
  return use(WorkflowUIContext);
}
