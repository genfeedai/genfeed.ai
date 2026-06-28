import type { SourceTool } from '../../interfaces/source-tool.interface.js';

/**
 * Brand context interview tools.
 *
 * Credit billing note: start_brand_interview charges 10 credits once inside the
 * engine (BrandInterviewService.start). These tool definitions carry creditCost:0
 * so the orchestrator never double-bills a per-turn charge on top.
 */
export const BRAND_INTERVIEW_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Start a brand context interview for the given brand. Charges 10 credits once (idempotent — resuming an active session does not re-charge). Returns the first question to ask the user, plus progress and completeness info.',
    name: 'start_brand_interview',
    parameters: {
      properties: {
        brandId: {
          description: 'ID of the brand to run the context interview for.',
          type: 'string',
        },
      },
      required: ['brandId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, mcp: true },
  },
  {
    creditCost: 0,
    description:
      "Submit the user's answer to the current interview question. Pass the interviewId from start_brand_interview. Returns the next question (if any) and updated progress.",
    name: 'submit_brand_interview_answer',
    parameters: {
      properties: {
        answer: {
          description:
            "The user's exact answer text to record for this question.",
          type: 'string',
        },
        interviewId: {
          description:
            'The interview session ID returned by start_brand_interview.',
          type: 'string',
        },
      },
      required: ['interviewId', 'answer'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, mcp: true },
  },
  {
    creditCost: 0,
    description:
      "Skip the current interview question (e.g. the user doesn't know or wants to skip). Returns the next question and updated progress.",
    name: 'skip_brand_interview_question',
    parameters: {
      properties: {
        interviewId: {
          description:
            'The interview session ID returned by start_brand_interview.',
          type: 'string',
        },
      },
      required: ['interviewId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Get the current brand context completeness score and a list of fields that still have gaps. Read-only, no credits charged.',
    name: 'get_brand_completeness',
    parameters: {
      properties: {
        brandId: {
          description: 'ID of the brand to check completeness for.',
          type: 'string',
        },
      },
      required: ['brandId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, mcp: true },
  },
];
