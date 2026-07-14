import { AGENT_ORCHESTRATOR_SYSTEM_PROMPT } from '@api/services/agent-orchestrator/constants/agent-orchestrator-system-prompt.constant';
import { detectPlatformIntentSuffix } from '@api/services/agent-orchestrator/constants/agent-type-config.constant';

const REPLY_STYLE_INSTRUCTIONS = {
  concise: 'Be brief and to the point. Short sentences, no fluff. No emoji.',
  detailed:
    'Provide thorough explanations with context and examples. No emoji.',
  friendly:
    'Be warm, clear, and conversational while staying professional. Use simple language. No emoji.',
  professional: 'Maintain a formal, business-appropriate tone. No emoji.',
} as const;

interface BuildAgentSystemPromptParams {
  readonly content: string;
  readonly pageContextPrompt: string;
  readonly skillPromptSuffix: string;
  readonly typeSuffix?: string;
}

export function buildAgentSystemPrompt({
  content,
  pageContextPrompt,
  skillPromptSuffix,
  typeSuffix = '',
}: BuildAgentSystemPromptParams): string {
  const platformSuffix =
    !typeSuffix && content ? detectPlatformIntentSuffix(content) : '';
  return (
    AGENT_ORCHESTRATOR_SYSTEM_PROMPT +
    (typeSuffix || platformSuffix) +
    (skillPromptSuffix ? `\n\n${skillPromptSuffix}` : '') +
    pageContextPrompt
  );
}

export function applyAgentReplyStyle(
  prompt: string,
  replyStyle?: string,
): string {
  if (!replyStyle) {
    return prompt;
  }
  const instruction =
    REPLY_STYLE_INSTRUCTIONS[
      replyStyle as keyof typeof REPLY_STYLE_INSTRUCTIONS
    ] ?? REPLY_STYLE_INSTRUCTIONS.concise;
  return `${prompt}\n\n## Reply Style\n${instruction}`;
}
