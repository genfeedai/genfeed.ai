import type { ExecutableEdge, ExecutableNode } from '../types';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  nodes: ExecutableNode[];
  edges: ExecutableEdge[];
  metadata: {
    version: string;
    createdAt: string;
    tags: string[];
  };
}
