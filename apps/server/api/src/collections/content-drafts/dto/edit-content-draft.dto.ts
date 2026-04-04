import { IsString } from 'class-validator';

export class EditContentDraftDto {
  @IsString()
  readonly content!: string;
}
