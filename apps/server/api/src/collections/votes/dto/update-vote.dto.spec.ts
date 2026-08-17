import { UpdateVoteDto } from '@api/collections/votes/dto/update-vote.dto';

describe('UpdateVoteDto', () => {
  it('should be defined', () => {
    expect(UpdateVoteDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateVoteDto();
      expect(dto).toBeInstanceOf(UpdateVoteDto);
    });
  });
});
