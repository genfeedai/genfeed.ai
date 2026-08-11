import {
  type InvitationAcceptanceOutcome,
  InvitationService,
} from '@api/collections/members/services/invitation.service';
import { Public } from '@libs/decorators/public.decorator';
import {
  BadRequestException,
  Controller,
  Get,
  HttpException,
  HttpStatus,
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
    try {
      const result = await this.invitationService.acceptInvitation(
        this.requireToken(token),
      );

      response.redirect(HttpStatus.SEE_OTHER, result.redirectUrl);
    } catch (error) {
      const outcome = this.getRecoverableOutcome(error);
      if (!outcome) {
        throw error;
      }

      response.redirect(
        HttpStatus.SEE_OTHER,
        this.invitationService.resolveInvitationOutcomeRedirectUrl(outcome),
      );
    }
  }

  private requireToken(token: string | undefined): string {
    if (!token?.trim()) {
      throw new BadRequestException('Invitation token is required');
    }

    return token;
  }

  private getRecoverableOutcome(
    error: unknown,
  ): InvitationAcceptanceOutcome | undefined {
    if (!(error instanceof HttpException)) {
      return undefined;
    }

    const status = error.getStatus();
    if (status === HttpStatus.BAD_REQUEST || status === HttpStatus.NOT_FOUND) {
      return 'invalid';
    }
    if (status !== HttpStatus.GONE) {
      return undefined;
    }

    const message = error.message.toLowerCase();
    if (message.includes('already been accepted')) {
      return 'already-accepted';
    }
    if (message.includes('expired')) {
      return 'expired';
    }
    if (message.includes('revoked')) {
      return 'revoked';
    }

    return 'invalid';
  }
}
