export interface WorkflowPreviewNode {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface WorkflowPreviewEdge {
  id?: string;
  source: string;
  target: string;
}

export interface WorkflowCardPreviewProps {
  name: string;
  thumbnail?: string | null;
  nodes?: readonly WorkflowPreviewNode[];
  edges?: readonly WorkflowPreviewEdge[];
}
