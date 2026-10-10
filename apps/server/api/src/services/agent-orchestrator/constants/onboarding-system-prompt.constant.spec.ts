import { COMMUNITY_ONBOARDING_SYSTEM_PROMPT } from '@api/services/agent-orchestrator/constants/community-onboarding-system-prompt.constant';
import { ONBOARDING_CONVERSATION_FLOW } from '@api/services/agent-orchestrator/constants/onboarding-conversation-flow.constant';
import { ONBOARDING_SYSTEM_PROMPT } from '@api/services/agent-orchestrator/constants/onboarding-system-prompt.constant';
import { describe, expect, it } from 'vitest';

describe.each([ONBOARDING_SYSTEM_PROMPT, COMMUNITY_ONBOARDING_SYSTEM_PROMPT])(
  'onboarding conversation',
  (prompt) => {
    it('shares the URL-first button-only flow', () => {
      expect(prompt).toContain(ONBOARDING_CONVERSATION_FLOW);
      for (const rule of [
        'server already wrote the greeting',
        'call scan_brand_url once',
        'Never automatically retry the same URL',
        'allowFreeText: true',
        'allowFreeText: false',
        'maxSelections: 3',
        'at most 5 options',
        'LAST option (id: skip)',
        'call save_onboarding_answers with only that field',
        'Never save skip as a value',
        'Go to my workspace calls complete_onboarding',
        'Never ask for social connections, payment, or publishing before the handoff',
      ])
        expect(prompt).toContain(rule);
      expect(prompt).toContain('scan_failed');
      expect(prompt).toContain('scan_in_progress');
      expect(prompt).toContain('never start a second scan');
      expect(prompt).toContain('keep the current brand name');
    });
  },
);
