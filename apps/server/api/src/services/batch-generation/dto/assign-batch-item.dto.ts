import { IsNotEmpty, IsString } from 'class-validator';

export class AssignBatchItemDto {
  @IsNotEmpty()
  @IsString()
  assigneeId!: string;
}
