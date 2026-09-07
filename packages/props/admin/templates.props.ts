/**
 * Props and interfaces for templates admin pages
 */

import type {
  TemplateMetadata,
  TemplatePerformance,
  TemplateVariable,
} from '@genfeedai/contracts/interfaces/content/template-ui.interface';

export interface TemplateDetailProps {
  templateId: string;
}

export interface TemplateSidebarProps {
  metadata: TemplateMetadata;
  performance: TemplatePerformance;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateVariablesCardProps {
  variables: TemplateVariable[];
}
