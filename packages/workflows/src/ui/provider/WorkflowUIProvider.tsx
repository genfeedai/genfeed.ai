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
  // Register each service adapter with the package's module-level services.
  // Every one resets to the package's standalone default when unset: a no-op
  // logger, the bare-fetch HTTP client with no auth headers, a throwing
  // "not configured" persistence stub so saves are never silently dropped, a
  // no-op edit applier, and device-local settings.
  const {
    applyEditOperations,
    executionApiBaseUrl,
    executionHeaders,
    executionHttpClient,
    logger,
    settingsSync,
    workflowPersistence,
    workflowReferences,
  } = config;
  // use-effect-audit: ignore configures module-level services outside React
  useEffect(() => {
    configureWorkflowLogger(logger);
    configureExecutionHttpClient(executionHttpClient);
    configureExecutionApiBaseUrl(executionApiBaseUrl);
    configureExecutionHeaders(executionHeaders);
    configureWorkflowPersistence(workflowPersistence);
    configureWorkflowRefApi(workflowReferences);
    configureApplyEditOperations(applyEditOperations);
    configureSettingsSync(settingsSync);
  }, [
    applyEditOperations,
    executionApiBaseUrl,
    executionHeaders,
    executionHttpClient,
    logger,
    settingsSync,
    workflowPersistence,
    workflowReferences,
  ]);

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
