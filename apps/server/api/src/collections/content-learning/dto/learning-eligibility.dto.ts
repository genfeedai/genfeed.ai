import { LearningMutationDto } from '@api/collections/content-learning/dto/learning-control.dto';
import { IsIn, IsISO8601 } from 'class-validator';
export class LearningEligibilityDto extends LearningMutationDto {
  @IsIn([true]) isOrganic!: boolean;
  @IsIn([false]) isPinned!: boolean;
  @IsISO8601() coverThrough!: string;
}
