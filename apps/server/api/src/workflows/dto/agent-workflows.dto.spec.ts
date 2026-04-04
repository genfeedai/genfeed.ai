import { CreateAgentWorkflowDto } from '@api/workflows/dto/create-agent-workflow.dto';
import { RollbackAgentWorkflowDto } from '@api/workflows/dto/rollback-agent-workflow.dto';
import { UpdateAgentWorkflowStateDto } from '@api/workflows/dto/update-agent-workflow-state.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('agent workflow DTO validation', () => {
  it('requires a non-empty agentId when creating workflows', async () => {
    const dto = plainToInstance(CreateAgentWorkflowDto, {});
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'agentId')).toBe(true);
  });

  it('rejects rollback targets outside the known workflow phases', async () => {
    const dto = plainToInstance(RollbackAgentWorkflowDto, {
      targetPhase: 'shipping',
    });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'targetPhase')).toBe(true);
  });

  it('validates nested workflow state payloads', async () => {
    const dto = plainToInstance(UpdateAgentWorkflowStateDto, {
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
    const dto = plainToInstance(UpdateAgentWorkflowStateDto, {
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
