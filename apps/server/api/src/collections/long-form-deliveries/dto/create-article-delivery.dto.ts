import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateArticleDeliveryDto {
  @ApiProperty({
    description:
      'Connected Ghost, WordPress, Medium or Dev.to account of the article brand to publish the article to.',
  })
  @IsEntityId()
  readonly credentialId!: string;
}
