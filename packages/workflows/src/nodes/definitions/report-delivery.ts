/**
 * Report Delivery Node
 *
 * Private output that delivers upstream analysis to the user via in-app
 * notification and/or email — not a public social publish (#2664).
 */

import type { BaseNodeData } from '../types';

export type ReportDeliveryChannel = 'notification' | 'email' | 'both';

export interface ReportDeliveryNodeData extends BaseNodeData {
  type: 'reportDelivery';
  /** Delivery channel */
  channel: ReportDeliveryChannel;
  /** Optional subject / title override */
  subject: string;
  /** Optional explicit email recipient (defaults to org owner) */
  email: string;
  /** Output: whether delivery succeeded */
  delivered: boolean | null;
  /** Output: destination label for history */
  destination: string | null;
}

export const DEFAULT_REPORT_DELIVERY_DATA: Partial<ReportDeliveryNodeData> = {
  channel: 'notification',
  delivered: null,
  destination: null,
  email: '',
  label: 'Send report',
  status: 'idle',
  subject: '',
  type: 'reportDelivery',
};
