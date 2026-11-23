import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { StartFacebookLiveVideoDto } from '@api/services/integrations/facebook/dto/start-facebook-live-video.dto';
import {
  FacebookLivePostService,
  type FacebookLiveScope,
} from '@api/services/integrations/facebook/services/facebook-live-post.service';
import { MemberRole } from '@genfeedai/contracts';
import type { IFacebookLiveVideo } from '@genfeedai/contracts/interfaces/integrations/facebook.interface';
import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

/** Start and end live videos on a connected Facebook Page (`publish_video`). */
@AutoSwagger()
@Controller('services/facebook')
@UseGuards(RolesGuard)
export class FacebookLiveController {
  constructor(private readonly livePosts: FacebookLivePostService) {}

  @Post(':credentialId/live')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  start(
    @CurrentUser() user: User,
    @Param('credentialId') credentialId: string,
    @Body() body: StartFacebookLiveVideoDto,
  ): Promise<IFacebookLiveVideo> {
    return this.livePosts.start(this.scope(user, credentialId), {
      description: body.description,
      title: body.title,
    });
  }

  @Post(':credentialId/live/:postId/end')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  end(
    @CurrentUser() user: User,
    @Param('credentialId') credentialId: string,
    @Param('postId') postId: string,
  ): Promise<IFacebookLiveVideo> {
    return this.livePosts.end(this.scope(user, credentialId), postId);
  }

  private scope(user: User, credentialId: string): FacebookLiveScope {
    if (!user.brandId) {
      throw new BadRequestException('Choose a brand before going live.');
    }

    return {
      brandId: user.brandId,
      credentialId,
      organizationId: user.organizationId,
      userId: user.userId,
    };
  }
}
