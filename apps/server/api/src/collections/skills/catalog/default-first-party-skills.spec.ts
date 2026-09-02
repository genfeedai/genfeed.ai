import { AgentType } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

import { resolveDefaultFirstPartySkillSlugs } from './default-first-party-skills';

describe('resolveDefaultFirstPartySkillSlugs', () => {
  it('packs image-prompt-engineer and model-selector for image generation', () => {
    expect(
      resolveDefaultFirstPartySkillSlugs({
        agentType: AgentType.IMAGE_CREATOR,
        modality: 'image',
      }),
    ).toEqual(['image-prompt-engineer', 'model-selector']);
  });

  it('packs x-content-creator when the channel is X', () => {
    expect(
      resolveDefaultFirstPartySkillSlugs({
        channel: 'x',
      }),
    ).toEqual(['x-content-creator']);
  });

  it('unions agent-type and channel defaults without dumping the catalog', () => {
    expect(
      resolveDefaultFirstPartySkillSlugs({
        agentType: AgentType.IMAGE_CREATOR,
        channel: 'x',
        modality: 'image',
      }),
    ).toEqual(['image-prompt-engineer', 'model-selector', 'x-content-creator']);
  });

  it('falls back to content-writing when no context is available', () => {
    expect(resolveDefaultFirstPartySkillSlugs({})).toEqual(['content-writing']);
  });
});
