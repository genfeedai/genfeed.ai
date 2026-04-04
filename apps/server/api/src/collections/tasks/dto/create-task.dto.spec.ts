import { CreateTaskDto } from '@api/collections/tasks/dto/create-task.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('CreateTaskDto', () => {
  it('should be defined', () => {
    expect(CreateTaskDto).toBeDefined();
  });

  describe('validation', () => {
    it('accepts a valid task payload with linked entities', async () => {
      const dto = plainToInstance(CreateTaskDto, {
        linkedEntities: [
          {
            entityId: '507f1f77bcf86cd799439011',
            entityModel: 'Post',
          },
        ],
        priority: 'high',
        status: 'todo',
        title: 'Add coverage for tasks collection',
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('rejects invalid linked entity models', async () => {
      const dto = plainToInstance(CreateTaskDto, {
        linkedEntities: [
          {
            entityId: '507f1f77bcf86cd799439011',
            entityModel: 'InvalidModel',
          },
        ],
        title: 'Broken linked entity',
      });

      const errors = await validate(dto);

      expect(errors).not.toHaveLength(0);
      expect(JSON.stringify(errors)).toContain('isEnum');
    });

    it('rejects overly long titles', async () => {
      const dto = plainToInstance(CreateTaskDto, {
        title: 'x'.repeat(501),
      });

      const errors = await validate(dto);

      expect(errors[0]?.constraints).toHaveProperty('maxLength');
    });
  });
});
