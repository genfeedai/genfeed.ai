import {
  RunEntity,
  RunEventEntity,
} from '@api/collections/runs/entities/run.entity';

describe('RunEntity', () => {
  it('should be defined', () => {
    expect(RunEntity).toBeDefined();
    expect(new RunEntity()).toBeInstanceOf(RunEntity);
  });

  it('should define RunEventEntity', () => {
    expect(RunEventEntity).toBeDefined();
    expect(new RunEventEntity()).toBeInstanceOf(RunEventEntity);
  });
});
