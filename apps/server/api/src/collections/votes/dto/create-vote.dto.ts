import { VoteEntityModel } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsString } from 'class-validator';
import { Types } from 'mongoose';

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

  @IsMongoId()
  @ApiProperty({
    description: 'The ID of the entity being voted on',
    required: true,
  })
  readonly entity!: Types.ObjectId;
}
