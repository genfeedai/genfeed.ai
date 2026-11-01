import {
  countTrailingPlanQuestions,
  parsePlanQuestion,
  parsePlanResponse,
} from '@api/services/agent-orchestrator/utils/agent-plan-question.util';
import { describe, expect, it } from 'vitest';

const validQuestion = {
  question: {
    options: [
      { id: 'a', label: 'A' },
      { description: 'second', id: 'b', label: 'B' },
    ],
    prompt: ' Which platform? ',
    recommendedOptionId: 'b',
  },
};

describe('parsePlanQuestion', () => {
  it('reads a card with trimmed text, a recommended option and free text on by default', () => {
    expect(parsePlanQuestion(validQuestion)).toEqual({
      allowFreeText: true,
      options: [
        { id: 'a', label: 'A' },
        { description: 'second', id: 'b', label: 'B' },
      ],
      prompt: 'Which platform?',
      recommendedOptionId: 'b',
      title: 'One question before the plan',
    });
  });

  it('drops a recommendation that is not one of the options', () => {
    const question = parsePlanQuestion({
      question: {
        ...validQuestion.question,
        recommendedOptionId: 'zzz',
      },
    });

    expect(question).not.toBeNull();
    expect(question).not.toHaveProperty('recommendedOptionId');
  });

  it.each([
    ['no question', {}],
    ['no prompt', { question: { options: validQuestion.question.options } }],
    ['no options', { question: { prompt: 'Q?', options: [] } }],
    [
      'six options',
      {
        question: {
          prompt: 'Q?',
          options: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({
            id,
            label: id,
          })),
        },
      },
    ],
    [
      'duplicate option ids',
      {
        question: {
          prompt: 'Q?',
          options: [
            { id: 'a', label: 'A' },
            { id: 'a', label: 'B' },
          ],
        },
      },
    ],
    [
      'an option without a label',
      { question: { prompt: 'Q?', options: [{ id: 'a' }] } },
    ],
  ])('rejects %s', (_label, parsed) => {
    expect(parsePlanQuestion(parsed)).toBeNull();
  });

  it('returns null when nothing was parsed', () => {
    expect(parsePlanQuestion(null)).toBeNull();
  });
});

describe('countTrailingPlanQuestions', () => {
  const asked = { metadata: { planQuestionRequestId: 'q' }, role: 'assistant' };

  it('counts consecutive questions back from the latest message', () => {
    expect(
      countTrailingPlanQuestions([
        asked,
        { role: 'user' },
        asked,
        { role: 'user' },
      ]),
    ).toBe(2);
  });

  it('starts again after a plan or any other assistant reply', () => {
    expect(
      countTrailingPlanQuestions([
        asked,
        { role: 'user' },
        { metadata: { proposedPlan: {} }, role: 'assistant' },
        { role: 'user' },
        asked,
        { role: 'user' },
      ]),
    ).toBe(1);
  });

  it('is zero for an empty thread', () => {
    expect(countTrailingPlanQuestions([])).toBe(0);
  });
});

describe('parsePlanResponse', () => {
  it('reads fenced JSON', () => {
    expect(parsePlanResponse('```json\n{"a":1}\n```').parsed).toEqual({ a: 1 });
  });

  it('keeps plain text and parses it to null', () => {
    expect(parsePlanResponse(' Just text ')).toEqual({
      candidate: 'Just text',
      parsed: null,
    });
  });

  it('reads the JSON object after a line of prose', () => {
    const reply =
      'I\'ll check your review queue for pending drafts first.\n{"title":"Check review queue","summary":"Checking pending drafts","steps":[{"step":"Fetch review queue","status":"in_progress"}]}';
    expect(parsePlanResponse(reply).parsed).toEqual({
      steps: [{ status: 'in_progress', step: 'Fetch review queue' }],
      summary: 'Checking pending drafts',
      title: 'Check review queue',
    });
  });

  it('reads fenced JSON after a line of prose', () => {
    const reply = 'Here is the plan.\n```json\n{"summary":"Plan"}\n```';
    expect(parsePlanResponse(reply).parsed).toEqual({ summary: 'Plan' });
  });

  it('keeps prose that only ends in braces as text', () => {
    expect(parsePlanResponse('Use the {name} token').parsed).toBeNull();
  });

  it('parses broken JSON to null', () => {
    expect(parsePlanResponse('{"a":').parsed).toBeNull();
  });
});
