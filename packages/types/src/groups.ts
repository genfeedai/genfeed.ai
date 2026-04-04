/**
 * Node Group Types
 * Groups allow users to organize and lock multiple nodes together
 */

export interface NodeGroup {
  id: string;
  name: string;
  nodeIds: string[];
  isLocked: boolean;
  color?: GroupColor;
  collapsed?: boolean;
}

export type GroupColor =
  | 'purple'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'pink'
  | 'gray';
