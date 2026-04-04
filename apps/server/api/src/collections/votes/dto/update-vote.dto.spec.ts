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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateVoteDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
