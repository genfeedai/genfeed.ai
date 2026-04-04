import { Timeframe } from '@genfeedai/enums';
import { IsArray, IsEnum, IsString } from 'class-validator';

export class GetForecastDto {
  @IsArray()
  @IsString({ each: true })
  metrics!: string[]; // ['engagement', 'followers', 'clicks']

  @IsEnum([Timeframe.D30, '60d', Timeframe.D90])
  period!: Timeframe.D30 | '60d' | Timeframe.D90;
}
