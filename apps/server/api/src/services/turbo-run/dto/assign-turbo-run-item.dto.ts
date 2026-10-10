import { IsNotEmpty, IsString } from 'class-validator';

export class AssignTurboRunItemDto {
  @IsNotEmpty()
  @IsString()
  assigneeId!: string;
}
