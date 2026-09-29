import { TaskQueryDto } from '@api/collections/tasks/dto/task-query.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('TaskQueryDto', () => {
  describe('validation', () => {
    it('rejects invalid parent ids', async () => {
      const dto = plainToInstance(TaskQueryDto, {
        parentId: 'not-an-object-id',
      });

      const errors = await validate(dto);

      expect(errors[0]?.constraints).toHaveProperty('isEntityId');
    });
  });
});
