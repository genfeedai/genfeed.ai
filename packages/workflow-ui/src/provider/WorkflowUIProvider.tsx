'use client';

import { createContext, type ReactNode, useContext, useEffect } from 'react';
import { configurePromptLibrary } from '../stores/promptLibraryStore';
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
  return useContext(WorkflowUIContext);
}
