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

/** A template reduced to what the admin pages render, whatever the API shape. */
export interface TemplateView {
  /** Template body (Handlebars for prompt templates). */
  body?: string;
  category?: string;
  description?: string;
  id: string;
  isActive?: boolean;
  /** Platform template: no organization owns it. */
  isSystem: boolean;
  key?: string;
  tags: string[];
  title: string;
  variableNames: string[];
}
