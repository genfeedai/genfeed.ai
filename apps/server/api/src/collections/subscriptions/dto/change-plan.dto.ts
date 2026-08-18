import { IsNotEmpty, IsString } from 'class-validator';

export class ChangePlanDto {
  @IsString()
  @IsNotEmpty()
  newPriceId!: string;
}
