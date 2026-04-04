import { describe, expect, it } from 'vitest';
import type { HookPerformanceTrackerNodeData } from './hook-performance-tracker';

describe('hook-performance-tracker node', () => {
  it('should export HookPerformanceTrackerNodeData interface with expected shape', () => {
    const data: Partial<HookPerformanceTrackerNodeData> = {
      autoAnalyzeAfterHours: 24,
      inputHookFormula: null,
      inputHookText: null,
      inputPostId: null,
      inputSlidePrompts: null,
      isTrackingEnabled: true,
      outputAnalysisSummary: null,
      outputPerformanceId: null,
      type: 'hookPerformanceTracker',
    };

    expect(data.type).toBe('hookPerformanceTracker');
    expect(data.isTrackingEnabled).toBe(true);
    expect(data.autoAnalyzeAfterHours).toBe(24);
    expect(data.inputPostId).toBeNull();
    expect(data.outputPerformanceId).toBeNull();
  });

  it('should allow boolean tracking toggle', () => {
    const enabled: Partial<HookPerformanceTrackerNodeData> = {
      isTrackingEnabled: true,
    };
    const disabled: Partial<HookPerformanceTrackerNodeData> = {
      isTrackingEnabled: false,
    };

    expect(enabled.isTrackingEnabled).toBe(true);
    expect(disabled.isTrackingEnabled).toBe(false);
  });
});
