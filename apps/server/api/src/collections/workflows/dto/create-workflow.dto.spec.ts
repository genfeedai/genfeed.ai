import { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
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
    });
  });
});
