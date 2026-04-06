import { useWorkflowStore } from '@genfeedai/workflow-ui/stores';
import { logger } from '@services/core/logger.service';
import { create } from 'zustand';
import { cloudNodeTypes } from '@/features/workflows/nodes/merged-node-types';
import {
  normalizeWorkflowNodeCollection,
  restoreWorkflowNodeTypes,
} from '@/features/workflows/nodes/node-type-normalization';
import type {
  BrandSummary,
  CloudWorkflowData,
  WorkflowApiService,
} from '@/features/workflows/services/workflow-api';

// =============================================================================
// TYPES
// =============================================================================

export type WorkflowLifecycle = 'draft' | 'published' | 'archived';

interface CloudWorkflowState {
  /** Cloud workflow ID (mirrors workflowStore.workflowId) */
  workflowId: string | null;
  /** Template to use when first creating a cloud workflow */
  pendingTemplateId: string | null;
  /** Metadata to attach when first creating a workflow */
  pendingCreateMetadata: Record<string, unknown> | null;
  /** Current lifecycle status */
  lifecycle: WorkflowLifecycle;
  /** Organization owning this workflow */
  organizationId: string | null;
  /** Whether the cloud store is currently loading data */
  isCloudLoading: boolean;
  /** Whether the initial cloud hydration has completed */
  isHydrated: boolean;
  /** Cloud-specific error message */
  cloudError: string | null;
  /** Auto-save timer reference */
  autoSaveTimeoutId: ReturnType<typeof setTimeout> | null;
  /** Available brands for BrandNode */
  brands: BrandSummary[];
  /** Whether brands are being loaded */
  isBrandsLoading: boolean;
}

interface CloudWorkflowActions {
  /** Load a workflow from the cloud API into the shared store */
  loadFromCloud: (
    workflowId: string,
    service: WorkflowApiService,
  ) => Promise<void>;
  /** Save the current shared store state to the cloud API */
  saveToCloud: (service: WorkflowApiService) => Promise<void>;
  /** Publish the current workflow */
  publishWorkflow: (service: WorkflowApiService) => Promise<void>;
  /** Archive the current workflow */
  archiveWorkflow: (service: WorkflowApiService) => Promise<void>;
  /** Duplicate the current workflow */
  duplicateWorkflow: (
    service: WorkflowApiService,
  ) => Promise<CloudWorkflowData>;
  /** Load brands for BrandNode */
  loadBrands: (service: WorkflowApiService) => Promise<void>;
  /** Schedule an auto-save after a debounce period */
  scheduleAutoSave: (service: WorkflowApiService) => void;
  /** Cancel any pending auto-save */
  cancelAutoSave: () => void;
  /** Reset cloud state (for unmount / navigation) */
  resetCloudState: () => void;
  /** Set cloud error */
  setCloudError: (error: string | null) => void;
  /** Mark initial hydration as complete */
  setHydrated: (isHydrated: boolean) => void;
  /** Prime the next create call with template provenance */
  setPendingTemplateCreate: (
    templateId: string | null,
    metadata?: Record<string, unknown> | null,
  ) => void;
}

export interface CloudWorkflowStore
  extends CloudWorkflowState,
    CloudWorkflowActions {}

// =============================================================================
// CONSTANTS
// =============================================================================

const AUTO_SAVE_DEBOUNCE_MS = 2000;

// =============================================================================
// STORE
// =============================================================================

/**
 * Cloud-specific workflow store.
 *
 * This store does NOT replace the shared useWorkflowStore. Instead it acts as
 * a companion store that manages cloud-specific concerns:
 *
 * - Lifecycle (draft / published / archived)
 * - API persistence (save/load via WorkflowApiService)
 * - Auto-save debouncing
 * - Brand list for BrandNode
 *
 * The actual workflow data (nodes, edges, groups) lives in the shared
 * useWorkflowStore from @genfeedai/workflow-ui.
 */
export const useCloudWorkflowStore = create<CloudWorkflowStore>()(
  (set, get) => ({
    archiveWorkflow: async (service) => {
      const { workflowId } = get();
      if (!workflowId) {
        set({ cloudError: 'Cannot archive: workflow has not been saved' });
        return;
      }

      try {
        const data = await service.archive(workflowId);
        set({ cloudError: null, lifecycle: data.lifecycle });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to archive workflow';
        logger.error('Cloud workflow archive failed', { error, workflowId });
        set({ cloudError: message });
      }
    },
    autoSaveTimeoutId: null,
    brands: [],

    cancelAutoSave: () => {
      const { autoSaveTimeoutId } = get();
      if (autoSaveTimeoutId) {
        clearTimeout(autoSaveTimeoutId);
        set({ autoSaveTimeoutId: null });
      }
    },
    cloudError: null,

    duplicateWorkflow: async (service) => {
      const { workflowId } = get();
      if (!workflowId) {
        throw new Error('Cannot duplicate: workflow has not been saved');
      }

      try {
        const data = await service.duplicate(workflowId);
        set({ cloudError: null });
        return data;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to duplicate workflow';
        logger.error('Cloud workflow duplicate failed', { error, workflowId });
        set({ cloudError: message });
        throw error;
      }
    },
    isBrandsLoading: false,
    isCloudLoading: false,
    isHydrated: false,
    lifecycle: 'draft',

    loadBrands: async (service) => {
      const { brands, isBrandsLoading } = get();
      if (isBrandsLoading || brands.length > 0) {
        return;
      }

      set({ isBrandsLoading: true });

      try {
        const brands = await service.listBrands();
        set({ brands, isBrandsLoading: false });
      } catch (error) {
        logger.error('Failed to load brands', { error });
        set({ isBrandsLoading: false });
      }
    },

    // ---------------------------------------------------------------------------
    // Actions
    // ---------------------------------------------------------------------------

    loadFromCloud: async (workflowId, service) => {
      set({ cloudError: null, isCloudLoading: true });

      try {
        const data = await service.get(workflowId);
        const supportedNodeTypes = new Set(Object.keys(cloudNodeTypes));
        const { nodes: normalizedNodes, repairs } =
          normalizeWorkflowNodeCollection(data.nodes ?? [], supportedNodeTypes);

        if (repairs.length > 0) {
          logger.warn('Cloud workflow repaired invalid node ids during load', {
            repairedNodes: repairs.map((repair) => ({
              index: repair.index,
              kind: repair.kind,
              nextId: repair.nextId || null,
              originalId: repair.originalId,
              type: repair.type,
            })),
            reportToSentry: false,
            workflowId,
          });
        }

        // Hydrate the shared workflow store with the fetched data
        const workflowStore = useWorkflowStore.getState();
        workflowStore.loadWorkflow({
          createdAt: data.createdAt,
          description: data.description ?? '',
          edgeStyle: data.edgeStyle as Parameters<
            typeof workflowStore.loadWorkflow
          >[0]['edgeStyle'],
          edges: (data.edges ?? []) as Parameters<
            typeof workflowStore.loadWorkflow
          >[0]['edges'],
          groups: data.groups,
          name: data.name,
          nodes: normalizedNodes as Parameters<
            typeof workflowStore.loadWorkflow
          >[0]['nodes'],
          updatedAt: data.updatedAt,
          version: 1,
        });

        // Set the workflowId on the shared store so execution/save knows the ID
        useWorkflowStore.setState({ isDirty: false, workflowId: data._id });

        // Update cloud-specific state
        set({
          isCloudLoading: false,
          lifecycle: data.lifecycle,
          organizationId: data.organization,
          workflowId: data._id,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to load workflow';
        logger.error('Cloud workflow load failed', { error, workflowId });
        set({ cloudError: message, isCloudLoading: false });
      }
    },
    organizationId: null,
    pendingCreateMetadata: null,
    pendingTemplateId: null,

    publishWorkflow: async (service) => {
      const { workflowId, saveToCloud } = get();

      if (!workflowId) {
        // Save first if no ID
        await saveToCloud(service);
      }

      const id = get().workflowId;
      if (!id) {
        set({ cloudError: 'Cannot publish: workflow must be saved first' });
        return;
      }

      try {
        const data = await service.publish(id);
        set({ cloudError: null, lifecycle: data.lifecycle });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to publish workflow';
        logger.error('Cloud workflow publish failed', {
          error,
          workflowId: id,
        });
        set({ cloudError: message });
      }
    },

    resetCloudState: () => {
      const { cancelAutoSave } = get();
      cancelAutoSave();

      set({
        autoSaveTimeoutId: null,
        cloudError: null,
        isCloudLoading: false,
        isHydrated: false,
        lifecycle: 'draft',
        organizationId: null,
        pendingCreateMetadata: null,
        pendingTemplateId: null,
        workflowId: null,
      });
    },

    saveToCloud: async (service) => {
      const { pendingCreateMetadata, pendingTemplateId, workflowId } = get();
      const workflowStore = useWorkflowStore.getState();

      // Prevent concurrent saves
      if (workflowStore.isSaving) {
        return;
      }

      useWorkflowStore.setState({ isSaving: true });

      try {
        const restoredNodes = restoreWorkflowNodeTypes(
          workflowStore.nodes,
        ) as CloudWorkflowData['nodes'];

        const payload = {
          edgeStyle: workflowStore.edgeStyle,
          edges: workflowStore.edges,
          groups: workflowStore.groups,
          name: workflowStore.workflowName,
          nodes: restoredNodes,
        };

        let savedData: CloudWorkflowData;

        if (workflowId) {
          // Update existing workflow
          savedData = await service.update(workflowId, payload);
        } else {
          // Create new workflow
          savedData = await service.create({
            ...payload,
            ...(pendingCreateMetadata
              ? { metadata: pendingCreateMetadata }
              : {}),
            name: payload.name || 'Untitled Workflow',
            ...(pendingTemplateId ? { templateId: pendingTemplateId } : {}),
          });

          // Update IDs after first save
          set({
            pendingCreateMetadata: null,
            pendingTemplateId: null,
            workflowId: savedData._id,
          });
          useWorkflowStore.setState({ workflowId: savedData._id });
        }

        useWorkflowStore.setState({ isDirty: false, isSaving: false });
        set({ cloudError: null });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to save workflow';
        logger.error('Cloud workflow save failed', { error, workflowId });
        useWorkflowStore.setState({ isSaving: false });
        set({ cloudError: message });
        throw error;
      }
    },

    scheduleAutoSave: (service) => {
      const { autoSaveTimeoutId } = get();
      const workflowStore = useWorkflowStore.getState();

      if (workflowStore.isSaving || !workflowStore.isDirty) {
        return;
      }

      // Clear any existing timer
      if (autoSaveTimeoutId) {
        clearTimeout(autoSaveTimeoutId);
      }

      const timeoutId = setTimeout(async () => {
        try {
          await get().saveToCloud(service);
        } catch {
          // Save errors are already logged in saveToCloud
        }
      }, AUTO_SAVE_DEBOUNCE_MS);

      set({ autoSaveTimeoutId: timeoutId });
    },

    setCloudError: (error) => {
      set({ cloudError: error });
    },
    setHydrated: (isHydrated) => {
      set({ isHydrated });
    },
    setPendingTemplateCreate: (templateId, metadata = null) => {
      set({
        pendingCreateMetadata: metadata,
        pendingTemplateId: templateId,
      });
    },
    // ---------------------------------------------------------------------------
    // Initial State
    // ---------------------------------------------------------------------------
    workflowId: null,
  }),
);
