import { UpdateTaskDto } from '@api/collections/tasks/dto/update-task.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('UpdateTaskDto', () => {
  it('should be defined', () => {
    expect(UpdateTaskDto).toBeDefined();
  });

  describe('validation', () => {
    it('accepts boolean soft-delete flags', async () => {
      const dto = plainToInstance(UpdateTaskDto, {
        isDeleted: true,
        status: 'blocked',
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('rejects non-boolean soft-delete flags', async () => {
      const dto = plainToInstance(UpdateTaskDto, {
        isDeleted: 'true',
      });

      const errors = await validate(dto);

      expect(errors[0]?.constraints).toHaveProperty('isBoolean');
    });
  });
});
