/**
 * Lightweight workflow type matching the server's list endpoint projection.
 * The list endpoint strips nodes, edges, metadata, version, and edgeStyle
 * to reduce payload size.
 */
export interface WorkflowListItem {
  _id: string;
  name: string;
  description?: string;
  lifecycle: 'draft' | 'published' | 'archived';
  thumbnail?: string | null;
  thumbnailNodeId?: string | null;
  createdAt: string;
  updatedAt: string;
}
