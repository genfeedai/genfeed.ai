import { ElementMoodEntity } from '@api/collections/elements/moods/entities/mood.entity';

describe('ElementMoodEntity', () => {
  it('should create an instance', () => {
    const entity = new ElementMoodEntity();
    expect(entity).toBeInstanceOf(ElementMoodEntity);
  });
});
