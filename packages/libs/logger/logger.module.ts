import { join } from 'node:path';
import { attachConsoleOutputErrorHandlers } from '@libs/logger/console-output-error-handler';
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
  return process.env.ENABLE_FILE_LOGGING === 'true';
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
        const consoleTransport = new transports.Console({
          format: combine(
            timestamp(),
            nestWinstonModuleUtilities.format.nestLike(),
          ),
          level: 'debug',
        });

        const detachConsoleOutputErrorHandlers =
          attachConsoleOutputErrorHandlers(consoleTransport);
        consoleTransport.once('close', detachConsoleOutputErrorHandlers);

        const configuredTransports: Array<
          | InstanceType<typeof transports.Console>
          | InstanceType<typeof transports.File>
        > = [consoleTransport];

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
