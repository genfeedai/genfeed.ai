'use client';

import {
  selectIsDirty,
  selectIsSaving,
  useWorkflowStore,
} from '@genfeedai/workflow-ui/stores';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { useCallback, useEffect, useRef } from 'react';
import type { WorkflowApiService } from '@/features/workflows/services/workflow-api';
import { createWorkflowApiService } from '@/features/workflows/services/workflow-api';
import { useCloudWorkflowStore } from '@/features/workflows/stores/cloud-workflow-store';

// =============================================================================
// TYPES
// =============================================================================

interface UseCloudWorkflowOptions {
  /** Existing workflow ID to load from cloud */
  workflowId?: string;
  /** Template ID to use when creating a new workflow */
  templateId?: string;
  /** Enable auto-save when the shared store becomes dirty */
  autoSave?: boolean;
}

interface UseCloudWorkflowReturn {
  /** Whether the workflow is being loaded from the cloud */
  isLoading: boolean;
  /** Whether the workflow is being saved */
  isSaving: boolean;
  /** Cloud-specific error message, if any */
  error: string | null;
  /** Current lifecycle status */
  lifecycle: 'draft' | 'published' | 'archived';
  /** Save the current workflow to the cloud */
  save: () => Promise<void>;
  /** Publish the workflow */
  publish: () => Promise<void>;
  /** Archive the workflow */
  archive: () => Promise<void>;
  /** Available brands for BrandNode */
  brands: Array<{
    _id: string;
    label: string;
    slug: string;
    logoUrl?: string;
    primaryColor?: string;
  }>;
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook that initializes and manages the cloud workflow store.
 *
 * Handles:
 * - Loading an existing workflow from the cloud API on mount
 * - Auto-saving when the shared workflow store becomes dirty
 * - Providing lifecycle actions (publish, archive)
 * - Loading brands for the BrandNode
 * - Cleanup on unmount (cancel auto-save, reset state)
 *
 * @example
 * ```tsx
 * function WorkflowEditorPage({ params }: { params: { id: string } }) {
 *   const { isLoading, error, lifecycle, save, publish, archive, brands } =
 *     useCloudWorkflow({ workflowId: params.id, autoSave: true });
 *
 *   if (isLoading) return <LoadingSpinner />;
 *   if (error) return <ErrorDisplay message={error} />;
 *
 *   return <WorkflowEditor />;
 * }
 * ```
 */
export function useCloudWorkflow({
  workflowId,
  templateId,
  autoSave = true,
}: UseCloudWorkflowOptions = {}): UseCloudWorkflowReturn {
  const getService = useAuthedService(
    createWorkflowApiService,
    EnvironmentService.JWT_LABEL,
  );

  const bindSharedWorkflowApi = useCallback((service: WorkflowApiService) => {
    useWorkflowStore.setState({
      listWorkflows: async () => {
        const workflows = await service.list();

        return workflows.map((workflow) => ({
          _id: workflow._id,
          createdAt: workflow.createdAt,
          edgeStyle: 'default',
          edges: [],
          groups: [],
          name: workflow.name,
          nodes: [],
          updatedAt: workflow.updatedAt,
        }));
      },
      loadWorkflowById: async (id: string) => {
        await useCloudWorkflowStore.getState().loadFromCloud(id, service);
      },
      saveWorkflow: async () => {
        await useCloudWorkflowStore.getState().saveToCloud(service);

        const workflowState = useWorkflowStore.getState();

        return {
          _id: workflowState.workflowId ?? '',
          createdAt: undefined,
          edgeStyle: workflowState.edgeStyle,
          edges: workflowState.edges,
          groups: workflowState.groups,
          name: workflowState.workflowName,
          nodes: workflowState.nodes,
          updatedAt: undefined,
        };
      },
    });
  }, []);

  // Store ref to track if component is still mounted
  const mountedRef = useRef(true);

  // Store ref for service to avoid recreating callbacks
  const serviceRef = useRef<WorkflowApiService | null>(null);

  // Abort controller for cleanup
  const abortRef = useRef<AbortController | null>(null);
  const hasRequestedBrandsRef = useRef(false);

  // Cloud store selectors
  const isCloudLoading = useCloudWorkflowStore((s) => s.isCloudLoading);
  const isHydrated = useCloudWorkflowStore((s) => s.isHydrated);
  const cloudError = useCloudWorkflowStore((s) => s.cloudError);
  const lifecycle = useCloudWorkflowStore((s) => s.lifecycle);
  const brands = useCloudWorkflowStore((s) => s.brands);
  const isBrandsLoading = useCloudWorkflowStore((s) => s.isBrandsLoading);

  // Shared store selectors
  const isDirty = useWorkflowStore(selectIsDirty);
  const isSaving = useWorkflowStore(selectIsSaving);

  // -------------------------------------------------------------------------
  // Load workflow on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    mountedRef.current = true;
    abortRef.current = new AbortController();
    hasRequestedBrandsRef.current = false;
    useCloudWorkflowStore.getState().resetCloudState();

    // Clear any stale workflow state before the async load completes.
    useWorkflowStore.getState().clearWorkflow();

    const initialize = async () => {
      try {
        const service = await getService();
        serviceRef.current = service;
        bindSharedWorkflowApi(service);

        if (!mountedRef.current) {
          return;
        }

        // Load existing workflow if ID provided
        if (workflowId) {
          await useCloudWorkflowStore
            .getState()
            .loadFromCloud(workflowId, service);
        } else if (templateId) {
          useCloudWorkflowStore.getState().setPendingTemplateCreate(templateId);
        }
      } catch (error) {
        if (mountedRef.current) {
          logger.error('Failed to initialize cloud workflow', {
            error,
            workflowId,
          });
        }
      } finally {
        if (mountedRef.current) {
          useCloudWorkflowStore.getState().setHydrated(true);
        }
      }
    };

    initialize();

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      useCloudWorkflowStore.getState().resetCloudState();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId, templateId, getService, bindSharedWorkflowApi]);

  useEffect(() => {
    if (brands.length > 0 || isBrandsLoading || hasRequestedBrandsRef.current) {
      return;
    }

    let cancelled = false;
    hasRequestedBrandsRef.current = true;

    const ensureBrandsLoaded = async () => {
      try {
        const service = serviceRef.current ?? (await getService());
        if (cancelled || !mountedRef.current) {
          return;
        }

        serviceRef.current = service;
        await useCloudWorkflowStore.getState().loadBrands(service);
      } catch (error) {
        if (!cancelled && mountedRef.current) {
          logger.error('Failed to load workflow brands', { error });
        }
      }
    };

    void ensureBrandsLoaded();

    return () => {
      cancelled = true;
    };
  }, [brands.length, getService, isBrandsLoading]);

  // -------------------------------------------------------------------------
  // Auto-save subscription
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!autoSave || !isDirty || !mountedRef.current) {
      return;
    }

    let cancelled = false;

    const scheduleAutoSave = async () => {
      try {
        const service = serviceRef.current ?? (await getService());
        if (cancelled) {
          return;
        }

        serviceRef.current = service;
        useCloudWorkflowStore.getState().scheduleAutoSave(service);
      } catch (error) {
        logger.error('Auto-save service initialization failed', { error });
      }
    };

    void scheduleAutoSave();

    return () => {
      cancelled = true;
      useCloudWorkflowStore.getState().cancelAutoSave();
    };
  }, [autoSave, getService, isDirty]);

  // -------------------------------------------------------------------------
  // Action callbacks
  // -------------------------------------------------------------------------
  const save = useCallback(async () => {
    try {
      const service = serviceRef.current ?? (await getService());
      serviceRef.current = service;
      await useCloudWorkflowStore.getState().saveToCloud(service);
    } catch (error) {
      logger.error('Manual save failed', { error });
    }
  }, [getService]);

  const publish = useCallback(async () => {
    try {
      const service = serviceRef.current ?? (await getService());
      serviceRef.current = service;
      await useCloudWorkflowStore.getState().publishWorkflow(service);
    } catch (error) {
      logger.error('Publish failed', { error });
    }
  }, [getService]);

  const archive = useCallback(async () => {
    try {
      const service = serviceRef.current ?? (await getService());
      serviceRef.current = service;
      await useCloudWorkflowStore.getState().archiveWorkflow(service);
    } catch (error) {
      logger.error('Archive failed', { error });
    }
  }, [getService]);

  return {
    archive,
    brands,
    error: cloudError,
    isLoading: !isHydrated || isCloudLoading,
    isSaving,
    lifecycle,
    publish,
    save,
  };
}
