/**
 * Send DM Node
 *
 * ACTION category node that sends a direct message on a social platform.
 * Requires brand input for credentials resolution.
 */

import type { BaseNodeData } from '@workflow-saas/types';

export type SendDmPlatform = 'twitter' | 'instagram';

/**
 * Send DM Node Data
 *
 * Inputs:
 * - brand (brand): Brand context (required)
 * - recipientId (text): Recipient user ID (required)
 * - text (text): Message text (required)
 *
 * Outputs:
 * - messageId (text): The ID of the sent message
 */
export interface SendDmNodeData extends BaseNodeData {
  type: 'sendDm';

  /** Platform to send DM on */
  platform: SendDmPlatform;
  /** Recipient user ID or username */
  recipientId: string;
  /** DM text */
  text: string;
  /** Optional media URL to attach */
  mediaUrl: string;

  /** Output - sent message ID */
  messageId: string | null;
}

/**
 * Default data for a new Send DM node
 */
export const DEFAULT_SEND_DM_DATA: Partial<SendDmNodeData> = {
  label: 'Send DM',
  mediaUrl: '',
  messageId: null,
  platform: 'twitter',
  recipientId: '',
  status: 'idle',
  text: '',
  type: 'sendDm',
};
