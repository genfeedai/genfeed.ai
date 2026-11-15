import { buildAgentMessageBrandWhere } from '@api/collections/agent-messages/utils/agent-message-brand.util';
import { describe, expect, it } from 'vitest';

describe('buildAgentMessageBrandWhere', () => {
  it('adds nothing for a viewer who reaches every brand', () => {
    expect(buildAgentMessageBrandWhere(undefined)).toEqual({});
  });

  it('keeps brandless messages and the listed brands', () => {
    expect(buildAgentMessageBrandWhere(['brand-b'])).toEqual({
      AND: [{ OR: [{ brandId: null }, { brandId: { in: ['brand-b'] } }] }],
    });
  });

  it('keeps only brandless messages when the viewer reaches no brand', () => {
    expect(buildAgentMessageBrandWhere([])).toEqual({
      AND: [{ OR: [{ brandId: null }, { brandId: { in: [] } }] }],
    });
  });
});
