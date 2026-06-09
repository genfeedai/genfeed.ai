import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  ConfigureUnipileDto,
  ListUnipileEmailsQueryDto,
  ListUnipileRecordsQueryDto,
  SendUnipileEmailDto,
} from '@api/services/integrations/unipile/dto/unipile.dto';
import { UnipileService } from '@api/services/integrations/unipile/services/unipile.service';
import type { User } from '@clerk/backend';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';

@AutoSwagger()
@Controller('services/unipile')
export class UnipileController {
  constructor(private readonly unipileService: UnipileService) {}

  @Post('connect')
  configure(
    @CurrentUser() user: User,
    @Body() body: ConfigureUnipileDto,
  ): ReturnType<UnipileService['configure']> {
    return this.unipileService.configure(this.getOrganizationId(user), body);
  }

  @Get('status')
  status(@CurrentUser() user: User): ReturnType<UnipileService['getStatus']> {
    return this.unipileService.getStatus(this.getOrganizationId(user));
  }

  @Get('accounts')
  accounts(
    @CurrentUser() user: User,
    @Query('cursor') cursor?: string,
  ): ReturnType<UnipileService['listAccounts']> {
    return this.unipileService.listAccounts(
      this.getOrganizationId(user),
      cursor,
    );
  }

  @Get('messages')
  messages(
    @CurrentUser() user: User,
    @Query() query: ListUnipileRecordsQueryDto,
  ): ReturnType<UnipileService['listMessages']> {
    const limit = this.toOptionalNumber(query.limit);

    return this.unipileService.listMessages(this.getOrganizationId(user), {
      ...(query.accountId ? { accountId: query.accountId } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(limit ? { limit } : {}),
    });
  }

  @Get('emails')
  emails(
    @CurrentUser() user: User,
    @Query() query: ListUnipileEmailsQueryDto,
  ): ReturnType<UnipileService['listEmails']> {
    const limit = this.toOptionalNumber(query.limit);

    return this.unipileService.listEmails(this.getOrganizationId(user), {
      ...(query.accountId ? { accountId: query.accountId } : {}),
      ...(query.after ? { after: query.after } : {}),
      ...(query.before ? { before: query.before } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(limit ? { limit } : {}),
      ...(query.metaOnly !== undefined ? { metaOnly: query.metaOnly } : {}),
    });
  }

  @Post('emails/send')
  sendEmail(
    @CurrentUser() user: User,
    @Body() body: SendUnipileEmailDto,
  ): ReturnType<UnipileService['sendEmail']> {
    return this.unipileService.sendEmail(this.getOrganizationId(user), body);
  }

  @Get('calendar/events')
  calendarEvents(
    @CurrentUser() user: User,
    @Query() query: ListUnipileRecordsQueryDto,
  ): ReturnType<UnipileService['listCalendarEvents']> {
    const limit = this.toOptionalNumber(query.limit);

    return this.unipileService.listCalendarEvents(
      this.getOrganizationId(user),
      {
        ...(query.accountId ? { accountId: query.accountId } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
        ...(limit ? { limit } : {}),
      },
    );
  }

  private getOrganizationId(user: User): string {
    const organizationId = getPublicMetadata(user).organization?.toString();
    if (!organizationId) {
      throw new BadRequestException('Organization context is required');
    }

    return organizationId;
  }

  private toOptionalNumber(value: string | undefined): number | undefined {
    if (!value) {
      return undefined;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}
