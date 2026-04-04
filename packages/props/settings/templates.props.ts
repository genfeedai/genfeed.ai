/**
 * Props and interfaces for templates settings page
 */

export interface Template {
  id: string;
  name: string;
  description: string;
  content: string;
  contentType: string;
  categories: string[];
  industries: string[];
  platforms: string[];
  variables: string[];
  usageCount?: number;
  isActive: boolean;
  createdAt: Date;
}
