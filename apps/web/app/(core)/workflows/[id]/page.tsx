'use client';

import type { ProviderModel } from '@genfeedai/types';
import { ReactFlowProvider } from '@xyflow/react';
import dynamic from 'next/dynamic';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { WorkflowEditorShell } from '@genfeedai/workflow-ui';
import { DebugPanel } from '@genfeedai/workflow-ui/panels';
import { WorkflowUIProvider } from '@genfeedai/workflow-ui/provider';
import type { WorkflowUIConfig } from '@genfeedai/workflow-ui/provider';
import { RunWorkflowConfirmationModal } from '@/components/RunWorkflowConfirmationModal';
import { Toolbar } from '@/components/toolbar';
import { CommandPalette } from '@/components/command-palette';
import { ModelBrowserModal } from '@/components/models/ModelBrowserModal';
import { AIGeneratorPanel } from '@/components/panels/AIGeneratorPanel';
import { ChatPanel } from '@/components/panels/ChatPanel';
import { PromptEditorModal } from '@/components/prompt-editor/PromptEditorModal';
import { CreatePromptModal, PromptLibraryModal, PromptPicker } from '@/components/prompt-library';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
import { apiClient } from '@/lib/api/client';
import { promptsApi, workflowsApi } from '@/lib/api';
import { usePromptLibraryStore } from '@/store/promptLibraryStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUIStore } from '@genfeedai/workflow-ui/stores';
import { useWorkflowStore } from '@/store/workflowStore';

// Dynamic imports for less frequently used modals to reduce initial bundle
const AnnotationModal = dynamic(
  () => import('@/components/annotation/AnnotationModal').then((mod) => mod.AnnotationModal),
  { ssr: false }
);
const CostModal = dynamic(() => import('@/components/cost').then((mod) => mod.CostModal), {
  ssr: false,
});
const GenerateWorkflowModal = dynamic(
  () =>
    import('@/components/workflow/GenerateWorkflowModal').then((mod) => mod.GenerateWorkflowModal),
  { ssr: false }
);
const TemplatesModal = dynamic(
  () => import('@/components/templates/TemplatesModal').then((mod) => mod.TemplatesModal),
  { ssr: false }
);
const WelcomeModal = dynamic(
  () => import('@/components/welcome/WelcomeModal').then((mod) => mod.WelcomeModal),
  { ssr: false }
);
const SettingsModal = dynamic(
  () => import('@/components/settings/SettingsModal').then((mod) => mod.SettingsModal),
  { ssr: false }
);

export default function WorkflowEditorPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workflowId = params.id as string;
  const renameParam = searchParams.get('rename');

  const { showAIGenerator, showDebugPanel, activeModal, openModal } = useUIStore();
  const hasSeenWelcome = useSettingsStore((s) => s.hasSeenWelcome);
  const autoSaveEnabled = useSettingsStore((s) => s.autoSaveEnabled);
  const debugMode = useSettingsStore((s) => s.debugMode);
  const isCreatePromptModalOpen = usePromptLibraryStore((s) => s.isCreateModalOpen);
  const {
    loadWorkflowById,
    createNewWorkflow,
    isLoading,
    workflowId: currentWorkflowId,
    setWorkflowName,
  } = useWorkflowStore();

  const [error, setError] = useState<string | null>(null);

  // Configure WorkflowUIProvider with core app's API services
  const workflowUIConfig = useMemo<WorkflowUIConfig>(
    () => ({
      fileUpload: {
        uploadFile: async (path: string, file: File) => {
          const result = await apiClient.uploadFile<{ url: string; filename: string }>(path, file);
          return result;
        },
      },
      ModelBrowserModal,
      modelSchema: {
        fetchModelSchema: async (
          modelId: string,
          signal?: AbortSignal
        ): Promise<ProviderModel | null> => {
          const response = await fetch(
            `/api/providers/models?query=${encodeURIComponent(modelId)}`,
            { signal }
          );
          if (!response.ok) return null;
          const data = await response.json();
          return data.models?.find((m: { id: string }) => m.id === modelId) ?? null;
        },
      },
      PromptPicker,
      promptLibrary: promptsApi,
      workflowsApi: {
        setThumbnail: (workflowId, thumbnailUrl, nodeId, signal) =>
          workflowsApi.setThumbnail(workflowId, thumbnailUrl, nodeId, signal).then(() => {}),
      },
    }),
    []
  );

  // Initialize auto-save (triggers 2.5s after last change)
  useAutoSave(autoSaveEnabled);

  // Initialize global keyboard shortcuts (⌘+K, ⌘+Enter, etc.)
  useGlobalShortcuts();

  // Load workflow on mount
  useEffect(() => {
    const controller = new AbortController();

    async function init() {
      try {
        if (workflowId === 'new') {
          // Create new workflow and redirect to its ID
          const newId = await createNewWorkflow(controller.signal);
          router.replace(`/workflows/${newId}`);
        } else {
          // Load existing workflow
          await loadWorkflowById(workflowId, controller.signal);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load workflow');
      }
    }

    init();

    return () => controller.abort();
  }, [workflowId, loadWorkflowById, createNewWorkflow, router]);

  // Handle rename from Save As feature
  useEffect(() => {
    if (renameParam && currentWorkflowId) {
      setWorkflowName(renameParam);
      // Clear the rename param from URL
      router.replace(`/workflows/${workflowId}`);
    }
  }, [renameParam, currentWorkflowId, setWorkflowName, router, workflowId]);

  // Show welcome modal on first visit
  useEffect(() => {
    if (!hasSeenWelcome && !activeModal && currentWorkflowId) {
      openModal('welcome');
    }
  }, [hasSeenWelcome, activeModal, openModal, currentWorkflowId]);

  // Show loading if:
  // 1. Currently loading
  // 2. Creating new workflow
  // 3. Workflow not yet loaded (requested ID doesn't match loaded ID)
  const isWorkflowNotLoaded = workflowId !== 'new' && workflowId !== currentWorkflowId;
  if (isLoading || (workflowId === 'new' && !currentWorkflowId) || isWorkflowNotLoaded) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[var(--background)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--muted-foreground)]">
            {workflowId === 'new' ? 'Creating workflow...' : 'Loading workflow...'}
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[var(--background)]">
        <div className="flex flex-col items-center gap-4 text-center max-w-md">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
            <span className="text-red-500 text-2xl">!</span>
          </div>
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            Failed to load workflow
          </h2>
          <p className="text-[var(--muted-foreground)]">{error}</p>
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/workflows')}
              className="px-4 py-2 text-sm bg-[var(--secondary)] text-[var(--foreground)] rounded-lg hover:opacity-90 transition"
            >
              Go to Dashboard
            </button>
            <button
              onClick={() => router.push('/workflows/new')}
              className="px-4 py-2 text-sm bg-white text-black rounded-lg hover:bg-white/90 transition"
            >
              Create New Workflow
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <WorkflowUIProvider config={workflowUIConfig}>
      <ReactFlowProvider>
        {/* Keep editor chrome package-owned so core/cloud cannot drift. */}
        <div className="h-screen w-screen flex flex-col overflow-hidden bg-[var(--background)] relative">
          <ChatPanel />
          <WorkflowEditorShell
            modalContent={
              <>
                <PromptLibraryModal />
                {/* Render CreatePromptModal independently when library modal is closed (e.g., saving from PromptNode) */}
                {isCreatePromptModalOpen && activeModal !== 'promptLibrary' && (
                  <CreatePromptModal />
                )}
                <PromptEditorModal />
                <SettingsModal />
                <AnnotationModal />
                <GenerateWorkflowModal />
                <TemplatesModal />
                <CostModal />
                <CommandPalette />
                <RunWorkflowConfirmationModal />
                {activeModal === 'welcome' && <WelcomeModal />}
              </>
            }
            rightPanel={
              <>
                {showAIGenerator && <AIGeneratorPanel />}
                {debugMode && showDebugPanel && <DebugPanel />}
              </>
            }
            toolbar={<Toolbar />}
          />
        </div>
      </ReactFlowProvider>
    </WorkflowUIProvider>
  );
}
