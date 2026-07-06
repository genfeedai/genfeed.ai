import { InvitationService } from '@api/collections/members/services/invitation.service';
import { Public } from '@libs/decorators/public.decorator';
import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

@Controller()
export class InvitationsController {
  constructor(private readonly invitationService: InvitationService) {}

  @Public()
  @Get('accept-invitation')
  async acceptInvitationRedirect(
    @Query('token') token: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.invitationService.acceptInvitation(
      this.requireToken(token),
    );

    response.redirect(303, result.redirectUrl);
  }

  private requireToken(token: string | undefined): string {
    if (!token?.trim()) {
      throw new BadRequestException('Invitation token is required');
    }

    return token;
  }
}
