import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global Prisma provider for runtimes that need the runtime-agnostic client
 * as-is (workers, files, and other non-API services). The API app provides its
 * own instrumented subclass under the same token via its local PrismaModule.
 */
@Global()
@Module({
  exports: [PrismaService],
  providers: [PrismaService],
})
export class PrismaModule {}
