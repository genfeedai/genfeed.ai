'use client';

import { createContext, type ReactNode, use, useEffect } from 'react';
import { configureWorkflowRefApi } from '../nodes/composition/workflow-ref-node.helpers';
import {
  configureExecutionApiBaseUrl,
  configureExecutionHeaders,
  configureExecutionHttpClient,
} from '../stores/execution/executionApi';
import { configureWorkflowLogger } from '../stores/executionLogger';
import { configureSettingsSync } from '../stores/settingsStore';
import { configureApplyEditOperations } from '../stores/workflow/applyEditOperations';
import { configureWorkflowPersistence } from '../stores/workflow/workflowPersistence';
import type { WorkflowUIConfig } from './types';

const WorkflowUIContext = createContext<WorkflowUIConfig>({});

/**
 * Provider that injects app-specific dependencies into workflow-ui components.
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
    configureExecutionApiBaseUrl(config.executionApiBaseUrl);
  }, [config.executionApiBaseUrl]);

  useEffect(() => {
    configureExecutionHeaders(config.executionHeaders);
  }, [config.executionHeaders]);

  // Register the workflow persistence backend. Resets to a throwing
  // "not configured" stub when unset so saves are never silently dropped.
  useEffect(() => {
    configureWorkflowPersistence(config.workflowPersistence);
  }, [config.workflowPersistence]);

  useEffect(() => {
    configureWorkflowRefApi(config.workflowReferences);
  }, [config.workflowReferences]);

  // Register the chat/agent edit-operations applier. Resets to a no-op when
  // unset (matching the package's standalone behavior).
  useEffect(() => {
    configureApplyEditOperations(config.applyEditOperations);
  }, [config.applyEditOperations]);

  // Register the settings server-sync adapter. Resets to a no-op when unset so
  // settings stay device-local (the package's standalone default).
  useEffect(() => {
    configureSettingsSync(config.settingsSync);
  }, [config.settingsSync]);

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
