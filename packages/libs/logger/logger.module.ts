import { join } from 'node:path';
import { LoggerService } from '@libs/logger/logger.service';
import { Global, Module } from '@nestjs/common';
import {
  utilities as nestWinstonModuleUtilities,
  WinstonModule,
} from 'nest-winston';
import { format, transports } from 'winston';

const { combine, timestamp } = format;

const FILTERED_ERROR_PATTERNS = [/reached/, /not found/, /not active/, /claim/];

function shouldEnableFileLogging(): boolean {
  if (process.env.ENABLE_FILE_LOGGING === 'true') {
    return true;
  }

  return process.env.NODE_ENV === 'development';
}

function shouldFilterMessage(message: unknown): boolean {
  return (
    typeof message === 'string' &&
    FILTERED_ERROR_PATTERNS.some((pattern) => pattern.test(message))
  );
}

@Global()
@Module({
  exports: [LoggerService],
  imports: [
    WinstonModule.forRootAsync({
      useFactory: () => {
        const configuredTransports: Array<
          | InstanceType<typeof transports.Console>
          | InstanceType<typeof transports.File>
        > = [
          new transports.Console({
            format: combine(
              timestamp(),
              nestWinstonModuleUtilities.format.nestLike(),
            ),
            level: 'debug',
          }),
        ];

        if (shouldEnableFileLogging()) {
          configuredTransports.push(
            new transports.File({
              filename: join('logs', 'errors.log'),
              format: combine(
                format((info) =>
                  shouldFilterMessage(info.message) ? false : info,
                )(),
                timestamp(),
                nestWinstonModuleUtilities.format.nestLike(),
              ),
              level: 'error',
              maxFiles: 5,
              maxsize: 1_000_000,
            }),
          );
        }

        return {
          transports: configuredTransports,
        };
      },
    }),
  ],
  providers: [LoggerService],
})
export class LoggerModule {}
