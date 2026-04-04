/**
 * Props and interfaces for contexts settings page
 */

export interface ContextBase {
  id: string;
  name: string;
  description: string;
  type: string;
  entryCount?: number;
  usageCount?: number;
  isActive: boolean;
  createdAt: Date;
}
