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
        brandId: 'clz1a2b3c4d5e6f7g8h9i0j1k',
        linkedEntities: [
          {
            entityId: 'clz1a2b3c4d5e6f7g8h9i0j1l',
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

    it('rejects non-canonical brand IDs', async () => {
      const dto = plainToInstance(CreateTaskDto, {
        brandId: 'legacy-brand-alias',
        title: 'Invalid brand identity',
      });

      const errors = await validate(dto);

      expect(errors[0]?.constraints).toHaveProperty('isEntityId');
    });

    it('rejects invalid linked entity models', async () => {
      const dto = plainToInstance(CreateTaskDto, {
        linkedEntities: [
          {
            entityId: 'clz1a2b3c4d5e6f7g8h9i0j1l',
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
