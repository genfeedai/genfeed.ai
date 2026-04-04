import {
  createExecutorRegistry,
  EXECUTOR_REGISTRY,
  getExecutor,
  getExecutorMetadata,
  getRegisteredNodeTypes,
  hasExecutor,
} from '@workflow-engine/executors/executor-registry';
import { describe, expect, it } from 'vitest';

describe('executor-registry', () => {
  describe('EXECUTOR_REGISTRY', () => {
    it('has all expected node types', () => {
      const types = Object.keys(EXECUTOR_REGISTRY);
      expect(types).toContain('brand');
      expect(types).toContain('publish');
      expect(types).toContain('condition');
      expect(types).toContain('delay');
      expect(types).toContain('noop');
    });
  });

  describe('getExecutor', () => {
    it('returns executor for known type', () => {
      const exec = getExecutor('noop');
      expect(exec).toBeDefined();
      expect(exec!.nodeType).toBe('noop');
    });

    it('returns undefined for unknown type', () => {
      expect(getExecutor('nonexistent')).toBeUndefined();
    });
  });

  describe('hasExecutor', () => {
    it('returns true for known type', () => {
      expect(hasExecutor('brand')).toBe(true);
    });
    it('returns false for unknown type', () => {
      expect(hasExecutor('nonexistent')).toBe(false);
    });
  });

  describe('getRegisteredNodeTypes', () => {
    it('returns array of node types', () => {
      const types = getRegisteredNodeTypes();
      expect(types.length).toBeGreaterThan(10);
      expect(types).toContain('noop');
    });
  });

  describe('getExecutorMetadata', () => {
    it('returns metadata for known type', () => {
      const meta = getExecutorMetadata('brand');
      expect(meta).toBeDefined();
      expect(meta!.nodeType).toBe('brand');
      expect(meta!.requiresResolver).toBe(true);
    });

    it('returns undefined for unknown type', () => {
      expect(getExecutorMetadata('nonexistent')).toBeUndefined();
    });
  });

  describe('ExecutorRegistryInstance', () => {
    it('creates registry with all executors', () => {
      const registry = createExecutorRegistry();
      expect(registry.has('noop')).toBe(true);
      expect(registry.has('brand')).toBe(true);
    });

    it('gets typed executors', () => {
      const registry = createExecutorRegistry();
      expect(registry.getConditionExecutor()).toBeDefined();
      expect(registry.getDelayExecutor()).toBeDefined();
      expect(registry.getBrandExecutor()).toBeDefined();
      expect(registry.getBrandContextExecutor()).toBeDefined();
      expect(registry.getBrandAssetExecutor()).toBeDefined();
      expect(registry.getPublishExecutor()).toBeDefined();
      expect(registry.getTweetInputExecutor()).toBeDefined();
      expect(registry.getTweetRemixExecutor()).toBeDefined();
      expect(registry.getRssInputExecutor()).toBeDefined();
      expect(registry.getSocialPublishExecutor()).toBeDefined();
      expect(registry.getTrendTriggerExecutor()).toBeDefined();
      expect(registry.getSoundOverlayExecutor()).toBeDefined();
      expect(registry.getVideoInputExecutor()).toBeDefined();
      expect(registry.getMusicSourceExecutor()).toBeDefined();
      expect(registry.getBeatAnalysisExecutor()).toBeDefined();
      expect(registry.getBeatSyncEditorExecutor()).toBeDefined();
      expect(registry.getCinematicColorGradeExecutor()).toBeDefined();
      expect(registry.getColorGradeExecutor()).toBeDefined();
      expect(registry.getFilmGrainExecutor()).toBeDefined();
      expect(registry.getLensEffectsExecutor()).toBeDefined();
      expect(registry.getPostReplyExecutor()).toBeDefined();
      expect(registry.getSendDmExecutor()).toBeDefined();
      expect(registry.getNewFollowerTriggerExecutor()).toBeDefined();
      expect(registry.getMentionTriggerExecutor()).toBeDefined();
      expect(registry.getNewLikeTriggerExecutor()).toBeDefined();
      expect(registry.getNewRepostTriggerExecutor()).toBeDefined();
      expect(registry.getImageGenExecutor()).toBeDefined();
      expect(registry.getKeywordTriggerExecutor()).toBeDefined();
      expect(registry.getEngagementTriggerExecutor()).toBeDefined();
    });

    it('allows setting custom executor', () => {
      const registry = createExecutorRegistry();
      const custom = {
        execute: async () => ({ data: null }),
        nodeType: 'custom',
      };
      registry.set('custom', custom);
      expect(registry.get('custom')).toBe(custom);
    });

    it('allows registering via function', () => {
      const registry = createExecutorRegistry();
      registry.register('myNode', async () => 'result');
      const exec = registry.get('myNode');
      expect(exec).toBeDefined();
      expect(exec!.nodeType).toBe('myNode');
    });

    it('returns undefined for wrong type cast', () => {
      const registry = createExecutorRegistry();
      registry.set('condition', {
        execute: async () => ({ data: null }),
        nodeType: 'condition',
      });
      expect(registry.getConditionExecutor()).toBeUndefined();
    });
  });
});
