import { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('CreateWorkflowDto', () => {
  describe('validation', () => {
    it.each(['default', 'smoothstep', 'straight'])(
      'retains %s edge style through whitelist validation',
      async (edgeStyle) => {
        const dto = plainToInstance(CreateWorkflowDto, {
          label: 'Styled graph',
          edgeStyle,
        });
        expect(await validate(dto, { whitelist: true })).toHaveLength(0);
        expect(dto).toHaveProperty('edgeStyle', edgeStyle);
      },
    );

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
  });
});
