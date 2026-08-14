import { AddSourceDto } from '@api/collections/contexts/dto/add-source.dto';
import { UpdateSourceDto } from '@api/collections/contexts/dto/update-source.dto';

describe('AddSourceDto', () => {
  it('creates an instance', () => {
    expect(new AddSourceDto()).toBeInstanceOf(AddSourceDto);
    expect(new UpdateSourceDto()).toBeInstanceOf(UpdateSourceDto);
  });
});
