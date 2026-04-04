/**
 * Types for @genfeedai/prompts package
 */

export interface PromptVariable {
  name: string;
  label: string;
  type: 'text' | 'select' | 'number' | 'boolean';
  required?: boolean;
  default?: string | number | boolean;
  options?: string[];
  placeholder?: string;
  description?: string;
}

export interface PromptTemplate {
  id: string;
  title: string;
  description: string;
  category: 'image-generation' | 'video-generation' | 'content';
  tier: 'free' | 'paid' | 'premium';
  template: string;
  variables: PromptVariable[];
  tags: string[];
  exampleOutput?: string;
  icon?: string;
  version: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface PromptCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  count: number;
}

export interface PromptCatalog {
  prompts: Array<{
    slug: string;
    title: string;
    description: string;
    category: string;
    tags: string[];
    tier: string;
    icon: string;
  }>;
}
