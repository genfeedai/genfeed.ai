import { validateAgentInputAnswer } from '@api/services/agent-threading/utils/validate-agent-input-answer.util';
import type { ResolveAgentInputRequestParams } from '@genfeedai/contracts/interfaces/ai/agent-input-request.interface';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

const PARAMS: ResolveAgentInputRequestParams = {
  threadId: 'thread-1',
  organizationId: 'organization-1',
  userId: 'user-1',
  requestId: 'request-1',
  brandId: 'brand-1',
  contextVersion: 3,
  answer: 'LinkedIn',
};
const REQUEST = {
  status: 'pending',
  metadata: { brandId: 'brand-1', contextVersion: 3 },
  allowFreeText: false,
  options: [
    { id: 'linkedin', label: 'LinkedIn' },
    { id: 'x', label: 'X' },
  ],
};

describe('validateAgentInputAnswer', () => {
  it('accepts a matching selection and trims its answer', () => {
    expect(
      validateAgentInputAnswer(REQUEST, {
        ...PARAMS,
        answer: ' LinkedIn ',
        optionIds: ['linkedin'],
      }),
    ).toBe('LinkedIn');
  });

  it('accepts ordered multi-select answers within the limit', () => {
    expect(
      validateAgentInputAnswer(
        { ...REQUEST, isMultiSelect: true, maxSelections: 2 },
        {
          ...PARAMS,
          answer: 'X, LinkedIn',
          optionIds: ['x', 'linkedin'],
        },
      ),
    ).toBe('X, LinkedIn');
    expect(
      validateAgentInputAnswer(
        { ...REQUEST, isMultiSelect: true },
        {
          ...PARAMS,
          answer: 'LinkedIn, X',
          optionIds: ['linkedin', 'x'],
        },
      ),
    ).toBe('LinkedIn, X');
  });

  it.each([
    { optionIds: [] },
    { optionIds: ['unknown'] },
    { optionIds: ['linkedin', 'linkedin'], answer: 'LinkedIn, LinkedIn' },
    { optionIds: ['linkedin', 'x'], answer: 'LinkedIn, X' },
    { optionIds: ['x'], answer: 'LinkedIn' },
    { optionIds: ['linkedin'], answer: 'x' },
  ])('rejects invalid single selections %j', (selection) => {
    expect(() =>
      validateAgentInputAnswer(REQUEST, { ...PARAMS, ...selection }),
    ).toThrow('Choose valid options within the selection limit.');
  });

  it('rejects answers exceeding an explicit multi-select limit', () => {
    expect(() =>
      validateAgentInputAnswer(
        { ...REQUEST, isMultiSelect: true, maxSelections: 1 },
        {
          ...PARAMS,
          answer: 'LinkedIn, X',
          optionIds: ['linkedin', 'x'],
        },
      ),
    ).toThrow('Choose valid options within the selection limit.');
  });

  it('accepts option IDs or labels for legacy answers without optionIds', () => {
    expect(validateAgentInputAnswer(REQUEST, PARAMS)).toBe('LinkedIn');
    expect(
      validateAgentInputAnswer(REQUEST, { ...PARAMS, answer: 'linkedin' }),
    ).toBe('linkedin');
  });

  it('allows free text only when the request permits it', () => {
    expect(() =>
      validateAgentInputAnswer(REQUEST, { ...PARAMS, answer: 'Other' }),
    ).toThrow('Choose one of the available options.');
    expect(
      validateAgentInputAnswer(
        { ...REQUEST, allowFreeText: true },
        { ...PARAMS, answer: ' Other ' },
      ),
    ).toBe('Other');
    expect(
      validateAgentInputAnswer(
        { status: 'pending' },
        { ...PARAMS, answer: 'Other' },
      ),
    ).toBe('Other');
  });

  it('rejects blank answers', () => {
    expect(() =>
      validateAgentInputAnswer(REQUEST, { ...PARAMS, answer: ' ' }),
    ).toThrow('An answer is required.');
  });

  it.each([
    { brandId: 'other-brand' },
    { contextVersion: 4 },
    { brandId: undefined },
    { contextVersion: undefined },
  ])('rejects stale or missing context %j', (context) => {
    expect(() =>
      validateAgentInputAnswer(REQUEST, { ...PARAMS, ...context }),
    ).toThrow(BadRequestException);
  });

  it('accepts same-answer retries and rejects changed answers', () => {
    const resolved = { ...REQUEST, status: 'resolved', answer: 'LinkedIn' };
    expect(validateAgentInputAnswer(resolved, PARAMS)).toBe('LinkedIn');
    expect(() =>
      validateAgentInputAnswer(resolved, { ...PARAMS, answer: 'X' }),
    ).toThrow('This request was already answered.');
  });
});
