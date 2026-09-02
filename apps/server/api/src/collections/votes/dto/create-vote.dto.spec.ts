import { CreateVoteDto } from '@api/collections/votes/dto/create-vote.dto';

describe('CreateVoteDto', () => {
  it('should be defined', () => {
    expect(CreateVoteDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateVoteDto();
      expect(dto).toBeInstanceOf(CreateVoteDto);
    });
  });
});
