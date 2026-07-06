import { UpdateWorkflowDto } from '@api/collections/workflows/dto/update-workflow.dto';
import { WorkflowLifecycle } from '@genfeedai/enums';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('UpdateWorkflowDto', () => {
  it('should be defined', () => {
    expect(UpdateWorkflowDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateWorkflowDto();
      expect(dto).toBeInstanceOf(UpdateWorkflowDto);
    });

    it('should allow a valid lifecycle value', async () => {
      const dto = plainToInstance(UpdateWorkflowDto, {
        lifecycle: WorkflowLifecycle.PUBLISHED,
      });

      const errors = await validate(dto);

      expect(errors).not.toContainEqual(
        expect.objectContaining({
          property: 'lifecycle',
        }),
      );
    });

    it('should reject an invalid lifecycle value', async () => {
      const dto = plainToInstance(UpdateWorkflowDto, {
        lifecycle: 'not-a-real-lifecycle',
      });

      const errors = await validate(dto);

      expect(errors).toContainEqual(
        expect.objectContaining({
          property: 'lifecycle',
        }),
      );
    });

    it('should allow omitting lifecycle entirely', async () => {
      const dto = plainToInstance(UpdateWorkflowDto, {
        label: 'Updated label',
      });

      const errors = await validate(dto);

      expect(errors).not.toContainEqual(
        expect.objectContaining({
          property: 'lifecycle',
        }),
      );
    });
  });
});
