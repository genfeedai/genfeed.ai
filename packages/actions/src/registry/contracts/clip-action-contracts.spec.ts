import {
  CLIP_PROCESSING_FLOWS,
  CLIP_SOURCE_KINDS,
  CLIP_SOURCE_STATUSES,
} from '@genfeedai/contracts/interfaces/content/clip-source.interface';
import { describe, expect, it } from 'vitest';
import { getClipActionContract } from './clip-action-contracts';

describe('clip action contracts', () => {
  it.each(['clip.analysis.fail', 'clip.analysis.prepare-source'])(
    '%s accepts every persisted clip source',
    (actionId) => {
      expect(getClipActionContract(actionId)?.inputSchema).toMatchObject({
        properties: {
          job: {
            properties: {
              source: {
                properties: {
                  flow: { enum: [...CLIP_PROCESSING_FLOWS] },
                  kind: { enum: [...CLIP_SOURCE_KINDS] },
                  status: { enum: [...CLIP_SOURCE_STATUSES] },
                },
              },
            },
          },
        },
      });
    },
  );
});
