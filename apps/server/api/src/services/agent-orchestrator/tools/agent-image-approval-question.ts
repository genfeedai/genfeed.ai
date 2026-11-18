import type { AgentInputRequestOption } from '@genfeedai/contracts/interfaces/ai/agent-input-request.interface';

const IMAGE = /\b(?:image|photo|illustration)s?\b/i;
const QUOTE = /\b(?:credits?|\d+(?:\.\d+)?\s*GEN)\b/i;
const APPROVE = /^(?:approve|confirm|authorize)\b/i;
const RENDER = /\b(?:generate|render)\b/i;

/** Recognizes an explicit approval choice, never authorizes or dispatches it. */
export function isImageApprovalQuestion(
  question: string,
  options: readonly Pick<AgentInputRequestOption, 'id' | 'label'>[],
): boolean {
  return options.some(({ id, label }) => {
    const action = id.replace(/[_-]/g, ' ');
    return (
      IMAGE.test(question + ' ' + label) &&
      (APPROVE.test(action) || APPROVE.test(label)) &&
      (QUOTE.test(question) || RENDER.test(label) || RENDER.test(action))
    );
  });
}
