import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [TransactionUtil],
  imports: [LoggerModule],
  providers: [TransactionUtil],
})
export class TransactionModule {}
