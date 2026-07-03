export interface ContentOptimizationJobData {
  type: 'analyze' | 'optimize-prompt';
  organizationId: string;
  brandId: string;
  prompt?: string;
}
