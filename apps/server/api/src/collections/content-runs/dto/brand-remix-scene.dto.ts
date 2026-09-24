import { IsIn, IsInt, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
export class ControlBrandRemixScenesDto {
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}
export class QuoteBrandRemixScenesDto extends ControlBrandRemixScenesDto {
  @IsIn(['analysis', 'generate', 'repair'])
  operation!: 'analysis' | 'generate' | 'repair';
  @IsOptional()
  @IsString()
  sceneId?: string;
  @IsOptional()
  @IsIn(['image', 'video'])
  repairStage?: 'image' | 'video';
}
export class ExecuteBrandRemixScenesDto extends ControlBrandRemixScenesDto {
  @IsString()
  quoteId!: string;
}
export class AttachBrandRemixAnalysisSourceDto extends ControlBrandRemixScenesDto {
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  assetId!: string | null;
}
