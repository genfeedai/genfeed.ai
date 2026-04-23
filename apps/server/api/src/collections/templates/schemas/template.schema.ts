import type { Template as PrismaTemplate } from '@genfeedai/prisma';

export interface ITemplateVariable {
  defaultValue?: string;
  description?: string;
  key: string;
  label?: string;
  required?: boolean;
  type?: string;
  [key: string]: unknown;
}

export interface TemplateDocument extends PrismaTemplate {
  _id: string;
  categories?: string[];
  content?: string;
  description?: string | null;
  industries?: string[];
  isActive?: boolean;
  key?: string | null;
  metadata?: Record<string, unknown> | null;
  platforms?: string[];
  purpose?: 'content' | 'prompt';
  rating?: number;
  scope?: string | null;
  tags?: string[];
  usageCount?: number;
  variables?: ITemplateVariable[];
  version?: number;
  [key: string]: unknown;
}

export type Template = TemplateDocument;
