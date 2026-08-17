import { TaskQueryDto } from '@api/collections/tasks/dto/task-query.dto';
import { testId } from '@helpers/testing/test-id.helper';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('TaskQueryDto', () => {
  it('should be defined', () => {
    expect(TaskQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('accepts valid status, priority, and parent filters', async () => {
      const dto = plainToInstance(TaskQueryDto, {
        brandId: testId('brand'),
        parentId: testId('parent'),
        priority: 'critical',
        status: 'in_review',
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('rejects invalid statuses', async () => {
      const dto = plainToInstance(TaskQueryDto, {
        status: 'waiting',
      });

      const errors = await validate(dto);

      expect(errors[0]?.constraints).toHaveProperty('isEnum');
    });

    it('rejects invalid parent ids', async () => {
      const dto = plainToInstance(TaskQueryDto, {
        parentId: 'not-an-object-id',
      });

      const errors = await validate(dto);

      expect(errors[0]?.constraints).toHaveProperty('isEntityId');
    });
  });
});
