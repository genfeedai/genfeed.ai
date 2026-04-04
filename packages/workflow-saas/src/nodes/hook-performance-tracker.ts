import type { BaseNodeData } from '@workflow-saas/types';

/**
 * Hook Performance Tracker Node Data
 *
 * Tracks hook performance metrics to enable a closed-loop feedback system.
 * Connects published posts back to the hooks and prompts that generated them,
 * allowing the system to learn which hooks perform best.
 */
export interface HookPerformanceTrackerNodeData extends BaseNodeData {
  type: 'hookPerformanceTracker';

  // Input from connections
  inputPostId: string | null;
  inputHookText: string | null;
  inputHookFormula: string | null;
  inputSlidePrompts: string[] | null;

  // Configuration
  isTrackingEnabled: boolean;
  autoAnalyzeAfterHours: number; // Default 24

  // Output
  outputPerformanceId: string | null;
  outputAnalysisSummary: string | null;
}
