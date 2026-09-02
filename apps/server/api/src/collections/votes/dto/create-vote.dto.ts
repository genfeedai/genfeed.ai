import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { VoteEntityModel } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';

export class CreateVoteDto {
  @IsString()
  @IsEnum(VoteEntityModel)
  @ApiProperty({
    description: 'The type of entity being voted on',
    enum: VoteEntityModel,
    enumName: 'VoteEntityModel',
    required: true,
  })
  readonly entityModel!: VoteEntityModel;

  @IsEntityId()
  @ApiProperty({
    description: 'The ID of the entity being voted on',
    required: true,
  })
  readonly entity!: string;
}
