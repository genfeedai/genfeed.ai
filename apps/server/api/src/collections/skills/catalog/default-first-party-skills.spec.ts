import { AgentType } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FIRST_PARTY_SKILL_SLUGS,
  isDefaultFirstPartySkillSlug,
  resolveDefaultFirstPartySkillSlugs,
} from './default-first-party-skills';

describe('resolveDefaultFirstPartySkillSlugs', () => {
  it('reports every context default as part of the default set', () => {
    for (const context of [
      {},
      { agentType: AgentType.IMAGE_CREATOR, modality: 'image' },
      { channel: 'tiktok' },
      { modality: 'audio' },
    ]) {
      for (const slug of resolveDefaultFirstPartySkillSlugs(context)) {
        expect(DEFAULT_FIRST_PARTY_SKILL_SLUGS).toContain(slug);
        expect(isDefaultFirstPartySkillSlug(slug)).toBe(true);
      }
    }
    expect(isDefaultFirstPartySkillSlug('hook-writer')).toBe(false);
  });
});
