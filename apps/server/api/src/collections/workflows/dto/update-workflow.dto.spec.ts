import { UpdateWorkflowDto } from '@api/collections/workflows/dto/update-workflow.dto';

describe('UpdateWorkflowDto', () => {
  it('should be defined', () => {
    expect(UpdateWorkflowDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateWorkflowDto();
      expect(dto).toBeInstanceOf(UpdateWorkflowDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateWorkflowDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
