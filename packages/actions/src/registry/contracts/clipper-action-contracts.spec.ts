import {
  CLIPPER_PROCESSING_FLOWS,
  CLIPPER_SOURCE_KINDS,
  CLIPPER_SOURCE_STATUSES,
} from '@genfeedai/contracts/interfaces/content/clipper-source.interface';
import { describe, expect, it } from 'vitest';
import { getClipActionContract } from './clipper-action-contracts';

describe('clip action contracts', () => {
  it.each(['clipper.analysis.fail', 'clipper.analysis.prepare-source'])(
    '%s accepts every persisted clip source',
    (actionId) => {
      expect(getClipActionContract(actionId)?.inputSchema).toMatchObject({
        properties: {
          job: {
            properties: {
              source: {
                properties: {
                  flow: { enum: [...CLIPPER_PROCESSING_FLOWS] },
                  kind: { enum: [...CLIPPER_SOURCE_KINDS] },
                  status: { enum: [...CLIPPER_SOURCE_STATUSES] },
                },
              },
            },
          },
        },
      });
    },
  );
});
