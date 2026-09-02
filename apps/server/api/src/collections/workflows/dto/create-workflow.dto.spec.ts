import { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
import { testId } from '@helpers/testing/test-id.helper';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('CreateWorkflowDto', () => {
  it('should be defined', () => {
    expect(CreateWorkflowDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateWorkflowDto();
      expect(dto).toBeInstanceOf(CreateWorkflowDto);
    });

    it('should allow visual builder creates without an explicit trigger', async () => {
      const dto = plainToInstance(CreateWorkflowDto, {
        brandId: 'cm0brand123',
        label: 'Untitled Workflow',
        nodes: [
          {
            data: {
              label: 'Start',
            },
            id: 'node-1',
            position: {
              x: 100,
              y: 200,
            },
            type: 'manualTrigger',
          },
        ],
      });

      const errors = await validate(dto);

      expect(errors).not.toContainEqual(
        expect.objectContaining({
          property: 'trigger',
        }),
      );
      expect(errors).not.toContainEqual(
        expect.objectContaining({
          property: 'organization',
        }),
      );
      expect(errors).not.toContainEqual(
        expect.objectContaining({
          property: 'user',
        }),
      );
    });

    it('allows clone creates to omit a label derived by the server', async () => {
      const dto = plainToInstance(CreateWorkflowDto, {
        sourceWorkflowId: testId('workflow'),
      });

      const errors = await validate(dto);

      expect(errors).not.toContainEqual(
        expect.objectContaining({ property: 'label' }),
      );
    });

    it('keeps editor prompt fields through whitelist stripping', async () => {
      const dto = plainToInstance(CreateWorkflowDto, {
        label: 'Prompt workflow',
        nodes: [
          {
            data: {
              label: 'Prompt',
              prompt: 'Write a FUD News brief',
              template: 'Hello {{topic}}',
            },
            id: 'PyHRz6uB',
            position: { x: 0, y: 0 },
            type: 'prompt',
          },
        ],
      });

      const errors = await validate(dto, { whitelist: true });
      const nodeData = dto.nodes?.[0]?.data;

      expect(errors).toHaveLength(0);
      expect(nodeData).toMatchObject({
        label: 'Prompt',
        prompt: 'Write a FUD News brief',
        template: 'Hello {{topic}}',
      });
    });

    it('still requires a label for non-clone creates', async () => {
      const dto = plainToInstance(CreateWorkflowDto, {});

      const errors = await validate(dto);

      expect(errors).toContainEqual(
        expect.objectContaining({ property: 'label' }),
      );
    });
  });
});
