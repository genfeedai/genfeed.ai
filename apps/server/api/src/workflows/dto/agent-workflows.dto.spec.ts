import { CreateAgentWorkflowDto } from '@api/workflows/dto/create-agent-workflow.dto';
import { PatchAgentWorkflowDto } from '@api/workflows/dto/patch-agent-workflow.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('agent workflow DTO validation', () => {
  it('requires a non-empty agentId when creating workflows', async () => {
    const dto = plainToInstance(CreateAgentWorkflowDto, {});
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'agentId')).toBe(true);
  });

  it.each([
    ['normal advance', { event: 'advance', questions: [] }],
    ['forced advance', { event: 'advance', force: true }],
    ['approval', { approaches: [], event: 'approve' }],
    ['rollback', { event: 'rollback', targetPhase: 'exploring' }],
  ])('accepts a valid %s event payload', async (_label, payload) => {
    const dto = plainToInstance(PatchAgentWorkflowDto, payload);

    expect(await validate(dto)).toHaveLength(0);
  });

  it.each([
    ['unknown event', { event: 'restart' }],
    ['rollback without a target', { event: 'rollback' }],
    [
      'rollback target on advance',
      { event: 'advance', targetPhase: 'exploring' },
    ],
    [
      'rollback target on approval',
      { event: 'approve', targetPhase: 'exploring' },
    ],
    ['force on approval', { event: 'approve', force: false }],
    [
      'force on rollback',
      { event: 'rollback', force: true, targetPhase: 'exploring' },
    ],
    [
      'state snapshot on rollback',
      { event: 'rollback', questions: [], targetPhase: 'exploring' },
    ],
    [
      'state snapshot on forced advance',
      { event: 'advance', force: true, messages: [] },
    ],
  ])('rejects %s', async (_label, payload) => {
    const dto = plainToInstance(PatchAgentWorkflowDto, payload);

    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('rejects rollback targets outside the known workflow phases', async () => {
    const dto = plainToInstance(PatchAgentWorkflowDto, {
      event: 'rollback',
      targetPhase: 'shipping',
    });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'targetPhase')).toBe(true);
  });

  it('validates nested workflow state payloads', async () => {
    const dto = plainToInstance(PatchAgentWorkflowDto, {
      approaches: [
        {
          description: 'Use the existing gate machine',
          id: 'approach-1',
          recommended: true,
          title: 'Reuse machine',
          tradeoffs: {
            cons: ['Slightly more setup'],
            pros: ['Keeps behavior consistent'],
          },
        },
      ],
      event: 'advance',
      isLocked: false,
      messages: [
        {
          content: 'Collected enough evidence to move forward.',
          id: 'message-1',
          phase: 'clarifying',
          role: 'agent',
          timestamp: Date.now(),
        },
      ],
      questions: [
        {
          id: 'question-1',
          options: ['A', 'B'],
          text: 'Which option should we pursue?',
          type: 'multiple_choice',
        },
      ],
      selectedApproachId: 'approach-1',
      verificationEvidence: [
        {
          content: 'Targeted tests are green.',
          id: 'evidence-1',
          passed: true,
          title: 'Workflow tests',
          type: 'test_result',
        },
      ],
    });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects invalid nested workflow state fields', async () => {
    const dto = plainToInstance(PatchAgentWorkflowDto, {
      approaches: [
        {
          description: '',
          id: 'approach-1',
          recommended: true,
          title: 'Broken approach',
          tradeoffs: {
            cons: ['Extra work'],
            pros: 'not-an-array',
          },
        },
      ],
      event: 'advance',
      messages: [
        {
          content: 'Missing valid phase.',
          id: 'message-1',
          phase: 'shipping',
          role: 'agent',
          timestamp: 'later',
        },
      ],
    });
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });
});
