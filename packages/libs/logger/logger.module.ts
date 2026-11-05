import { join } from 'node:path';
import { attachConsoleOutputErrorHandlers } from '@libs/logger/console-output-error-handler';
import { LoggerService } from '@libs/logger/logger.service';
import { shouldDropLoggerInfo } from '@libs/logger/logger-filters';
import { isWideEventInfo } from '@libs/logger/wide-event/wide-event.level';
import { Global, Module } from '@nestjs/common';
import {
  utilities as nestWinstonModuleUtilities,
  WinstonModule,
} from 'nest-winston';
import { format, transports } from 'winston';

const { combine, timestamp } = format;

const FILTERED_ERROR_PATTERNS = [/reached/, /not found/, /not active/, /claim/];

/**
 * Wide events are the queryable record of a request, so deployed environments
 * print them as one JSON object per line (no ANSI, no pretty-printing) for the
 * log pipeline to index. Local dev keeps the readable Nest-style rendering.
 */
function createConsoleFormat() {
  const nestLike = nestWinstonModuleUtilities.format.nestLike();
  const json = format.json();
  const isJsonOutput = process.env.NODE_ENV === 'production';

  return format((info, options) =>
    isJsonOutput && isWideEventInfo(info)
      ? json.transform(info, options)
      : nestLike.transform(info, options),
  )();
}

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
      imports: [],
      useFactory: () => {
        const consoleTransport = new transports.Console({
          format: combine(
            timestamp(),
            format((info) => (shouldDropLoggerInfo(info) ? false : info))(),
            createConsoleFormat(),
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
