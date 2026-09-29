import { UpdateTaskDto } from '@api/collections/tasks/dto/update-task.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('UpdateTaskDto', () => {
  describe('validation', () => {
    it('rejects non-boolean soft-delete flags', async () => {
      const dto = plainToInstance(UpdateTaskDto, {
        isDeleted: 'true',
      });

      const errors = await validate(dto);

      expect(errors[0]?.constraints).toHaveProperty('isBoolean');
    });
  });
});
