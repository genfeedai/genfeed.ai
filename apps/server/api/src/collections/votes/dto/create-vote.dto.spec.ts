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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateVoteDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
