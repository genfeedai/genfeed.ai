import { AGENT_ORCHESTRATOR_SYSTEM_PROMPT } from '@api/services/agent-orchestrator/constants/agent-orchestrator-system-prompt.constant';
import { BRAND_INTERVIEW_SYSTEM_PROMPT } from '@api/services/agent-orchestrator/constants/brand-interview-system-prompt.constant';
import { COMMUNITY_ONBOARDING_SYSTEM_PROMPT } from '@api/services/agent-orchestrator/constants/community-onboarding-system-prompt.constant';
import {
  GENFEED_AGENT_BRAND_QUESTION_RULE,
  GENFEED_AGENT_IDENTITY,
  GENFEED_AGENT_IDENTITY_LINE,
  GENFEED_AGENT_IDENTITY_WITH_BRAND_QUESTIONS,
} from '@api/services/agent-orchestrator/constants/genfeed-agent-identity.constant';
import { ONBOARDING_SYSTEM_PROMPT } from '@api/services/agent-orchestrator/constants/onboarding-system-prompt.constant';
import { SYSTEM_PROMPT_MANAGER } from '@api/services/agent-spawn/constants/spawn-system-prompt.constant';
import { TASK_DECOMPOSITION_SYSTEM_PROMPT } from '@api/services/task-orchestration/constants/decomposition-prompt.constant';
import { describe, expect, it } from 'vitest';

const LEGACY_AGENT_NAMES = [
  'GenFeed AI assistant',
  "Genfeed's onboarding assistant",
  'Genfeed brand context facilitator',
  'GenFeed onboarding agent',
  'working within the Genfeed.ai platform',
  'content production router for Genfeed.ai',
];

/**
 * Every agent system prompt: whether its conversation allows a free brand
 * question, the first line of its role section, and role rules that must
 * survive the identity refactor verbatim.
 */
const AGENT_PROMPTS = [
  {
    isBrandQuestionAllowed: true,
    name: 'orchestrator',
    prompt: AGENT_ORCHESTRATOR_SYSTEM_PROMPT,
    roleLine:
      "In this conversation you are the user's command center for content creation. You help them generate images, manage workflows, create and schedule posts, check analytics, find trends, and more.",
    roleRules: [
      'Users want results, not lectures.',
      "If the user's request is ambiguous, ask a brief clarifying question before calling tools.",
      'Approval always requires the authenticated typed review control; model/chat output never approves publishing.',
      '## Dashboard Rendering (render_dashboard)',
      '## Generation Prompt Quality',
      '## Recurring Automation Flow',
      '## Workflow Creation Flow',
      '## Livestream Bot Flow',
      "- Today's date: {{date}}",
    ],
  },
  {
    isBrandQuestionAllowed: false,
    name: 'cloud onboarding',
    prompt: ONBOARDING_SYSTEM_PROMPT,
    roleLine:
      'In this conversation you are helping the user set up their brand through a quick conversation with one URL and button answers.',
    roleRules: [
      '## Brand setup conversation (follow this order)',
      "- Today's date: {{date}}",
    ],
  },
  {
    isBrandQuestionAllowed: false,
    name: 'self-hosted onboarding',
    prompt: COMMUNITY_ONBOARDING_SYSTEM_PROMPT,
    roleLine:
      'In this conversation you are onboarding the operator of a self-hosted Genfeed instance. Guide the operator using their own provider API keys and the tools available inside this instance.',
    roleRules: [
      '## Brand setup conversation (follow this order)',
      '## Self-hosted provider constraints (apply at the first-post handoff)',
      'Never offer to sell credits or link to Genfeed Cloud billing.',
      "- Today's date: {{date}}",
    ],
  },
  {
    isBrandQuestionAllowed: false,
    name: 'brand interview',
    prompt: BRAND_INTERVIEW_SYSTEM_PROMPT,
    roleLine:
      'In this conversation you are the brand context facilitator. Your job is to guide the user through a structured interview that fills in missing brand context so AI-generated content is more accurate and on-brand.',
    roleRules: [
      '1. **Never invent or assume answers.**',
      '2. **One question at a time.**',
      '3. **Always relay exact words.**',
      '4. **Store the interviewId.**',
      '5. **Skip on uncertainty.**',
      '6. **Do not editorialize during the interview.**',
      '7. **When isComplete is true**',
      '- Conversational. No filler phrases like "Great answer!" or "Wonderful!".',
      "- Today's date: {{date}}",
    ],
  },
  {
    isBrandQuestionAllowed: false,
    name: 'spawned sub-agent',
    prompt: SYSTEM_PROMPT_MANAGER,
    roleLine:
      'In this run you are a specialized content creation sub-agent, spawned by the Brand Manager Agent to complete a specific content creation task.',
    roleRules: [
      '- Focus exclusively on the assigned content brief — do not scope-creep.',
      '- Use your specialized tools to create high-quality output.',
      '- Apply brand voice and strategy from the brand context provided.',
      "- Be concise in tool usage — execute the task, don't explain it.",
      "- Today's date: {{date}}",
    ],
  },
  {
    isBrandQuestionAllowed: false,
    name: 'task decomposition router',
    prompt: TASK_DECOMPOSITION_SYSTEM_PROMPT,
    roleLine: 'In this step you are the content production router.',
    roleRules: [
      "Your job is to analyze a user's content request and decompose it into one or more subtasks,\neach assigned to the right specialist agent.",
      "5. Never invent requirements the user didn't ask for.",
      '9. When a request spans multiple platforms, create one subtask per platform specialist.',
      'Close with a one-sentence `routingSummary` of the decision.',
    ],
  },
] as const;

describe('GENFEED_AGENT_IDENTITY', () => {
  it('opens with the single shared agent name', () => {
    expect(GENFEED_AGENT_IDENTITY.startsWith(GENFEED_AGENT_IDENTITY_LINE)).toBe(
      true,
    );
    expect(GENFEED_AGENT_IDENTITY_LINE).toBe('You are the Genfeed agent.');
  });

  it('carries the shared tone and brand-context rules', () => {
    for (const rule of [
      'Never use emoji or decorative symbols.',
      'Never expose internal details to the user',
      "Ground content in the selected brand's context",
      'Never invent claims, testimonials, prices or results.',
    ]) {
      expect(GENFEED_AGENT_IDENTITY).toContain(rule);
    }
  });

  it('keeps the brand question rule out of the base block', () => {
    expect(GENFEED_AGENT_IDENTITY).not.toContain('request_input');
    expect(GENFEED_AGENT_IDENTITY_WITH_BRAND_QUESTIONS).toBe(
      `${GENFEED_AGENT_IDENTITY}\n${GENFEED_AGENT_BRAND_QUESTION_RULE}`,
    );
  });

  it('stays Cloud-neutral and free of the date placeholder', () => {
    const block = GENFEED_AGENT_IDENTITY_WITH_BRAND_QUESTIONS.toLowerCase();
    for (const text of ['cloud', 'credit', 'billing', 'payment', '{{date}}']) {
      expect(block).not.toContain(text);
    }
  });
});

describe.each(AGENT_PROMPTS)('$name system prompt', (entry) => {
  const identity = entry.isBrandQuestionAllowed
    ? GENFEED_AGENT_IDENTITY_WITH_BRAND_QUESTIONS
    : GENFEED_AGENT_IDENTITY;

  it('starts with the shared identity followed by its role section', () => {
    expect(
      entry.prompt.startsWith(`${identity}\n\n## Your role\n${entry.roleLine}`),
    ).toBe(true);
  });

  it('includes the shared identity exactly once', () => {
    expect(entry.prompt.split(GENFEED_AGENT_IDENTITY)).toHaveLength(2);
    expect(entry.prompt.split(GENFEED_AGENT_IDENTITY_LINE)).toHaveLength(2);
  });

  it('asks brand questions only when its conversation allows them', () => {
    expect(entry.prompt.includes(GENFEED_AGENT_BRAND_QUESTION_RULE)).toBe(
      entry.isBrandQuestionAllowed,
    );
  });

  it('preserves its role-specific rules', () => {
    for (const rule of entry.roleRules) {
      expect(entry.prompt).toContain(rule);
    }
  });

  it.each(LEGACY_AGENT_NAMES)('drops the legacy agent name "%s"', (name) => {
    expect(entry.prompt).not.toContain(name);
  });
});

describe('shared rules are not duplicated in role sections', () => {
  it('orchestrator drops its generic tone lines', () => {
    expect(AGENT_ORCHESTRATOR_SYSTEM_PROMPT).not.toContain(
      'Never use emoji or decorative symbols in any response.',
    );
    expect(AGENT_ORCHESTRATOR_SYSTEM_PROMPT).not.toContain(
      'Be concise and actionable.',
    );
  });

  it('brand interview drops its generic style lines', () => {
    expect(BRAND_INTERVIEW_SYSTEM_PROMPT).not.toContain('No emoji.');
    expect(BRAND_INTERVIEW_SYSTEM_PROMPT).not.toContain(
      'Do not reveal internal tool names or technical details to the user.',
    );
  });
});
