import { CreateVoteDto } from '@api/collections/votes/dto/create-vote.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateVoteDto extends PartialType(CreateVoteDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the vote is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
