import {
  Task,
  type TaskDocument,
  TaskSchema,
} from '@api/collections/tasks/schemas/task.schema';
import mongoose, { Model, Types } from 'mongoose';

describe('TaskSchema', () => {
  let model: Model<TaskDocument>;

  beforeAll(() => {
    model = mongoose.model<TaskDocument>(
      `TaskSchemaSpec${Date.now()}`,
      TaskSchema,
    );
  });

  it('should be defined', () => {
    expect(Task).toBeDefined();
    expect(TaskSchema).toBeDefined();
  });

  it('applies defaults for workflow state fields', () => {
    const doc = new model({
      identifier: 'GENA-1',
      organization: new Types.ObjectId(),
      taskNumber: 1,
      title: 'Document defaults',
    });

    expect(doc.status).toBe('backlog');
    expect(doc.priority).toBe('medium');
    expect(doc.linkedEntities).toEqual([]);
    expect(doc.isDeleted).toBe(false);
  });

  it('accepts valid linked entities', () => {
    const doc = new model({
      identifier: 'GENA-2',
      linkedEntities: [
        {
          entityId: new Types.ObjectId(),
          entityModel: 'Post',
        },
      ],
      organization: new Types.ObjectId(),
      taskNumber: 2,
      title: 'Linked entity coverage',
    });

    const error = doc.validateSync();

    expect(error).toBeUndefined();
  });

  it('rejects invalid linked entity models', () => {
    const doc = new model({
      identifier: 'GENA-3',
      linkedEntities: [
        {
          entityId: new Types.ObjectId(),
          entityModel: 'UnknownModel',
        },
      ],
      organization: new Types.ObjectId(),
      taskNumber: 3,
      title: 'Invalid linked entity',
    });

    const error = doc.validateSync();

    expect(error).toBeDefined();
    expect(error?.errors['linkedEntities.0.entityModel']).toBeDefined();
  });
});
