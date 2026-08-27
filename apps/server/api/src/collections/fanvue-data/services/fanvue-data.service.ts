import { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class FanvueDataService {
  constructor(
    readonly prisma: PrismaService,
    readonly logger: LoggerService,
  ) {}
}
