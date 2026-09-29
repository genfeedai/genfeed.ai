import { UpdateVoteDto } from '@api/collections/votes/dto/update-vote.dto';

describe('UpdateVoteDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateVoteDto();
      expect(dto).toBeInstanceOf(UpdateVoteDto);
    });
  });
});
