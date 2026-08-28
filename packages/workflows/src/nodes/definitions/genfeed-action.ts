import type { BaseNodeData } from '../types';

export interface GenfeedActionNodeData extends BaseNodeData {
  actionId: string;
  parameters: Record<string, unknown>;
  type: 'genfeedAction';
}

export const DEFAULT_GENFEED_ACTION_DATA: Partial<GenfeedActionNodeData> = {
  actionId: '',
  label: 'Genfeed Action',
  parameters: {},
  status: 'idle',
  type: 'genfeedAction',
};
