import { join } from 'node:path';
import { attachConsoleOutputErrorHandlers } from '@libs/logger/console-output-error-handler';
import { LoggerService } from '@libs/logger/logger.service';
import { shouldDropLoggerInfo } from '@libs/logger/logger-filters';
import { Global, Module } from '@nestjs/common';
import {
  utilities as nestWinstonModuleUtilities,
  WinstonModule,
} from 'nest-winston';
import { format, transports } from 'winston';

const { combine, timestamp } = format;

const FILTERED_ERROR_PATTERNS = [/reached/, /not found/, /not active/, /claim/];

/**
 * Production prints every line as one JSON object (no ANSI, no pretty-printing)
 * for the log pipeline to index, and drops debug lines. The Nest-style
 * rendering parses, inspects and colours each line's context on the one thread
 * that also serves requests, and prod stalls of that thread (#10110) come in
 * bursts of requests that each log. Local dev keeps the readable rendering and
 * the debug lines.
 */
function isProductionLogging(): boolean {
  return process.env.NODE_ENV === 'production';
}

function createConsoleFormat() {
  const nestLike = nestWinstonModuleUtilities.format.nestLike();
  const json = format.json();
  const isJsonOutput = isProductionLogging();

  return format((info, options) =>
    isJsonOutput
      ? json.transform(info, options)
      : nestLike.transform(info, options),
  )();
}

/** The one console sink every service logs through. */
export function createConsoleTransport() {
  return new transports.Console({
    format: combine(
      timestamp(),
      format((info) => (shouldDropLoggerInfo(info) ? false : info))(),
      createConsoleFormat(),
    ),
    level: isProductionLogging() ? 'info' : 'debug',
  });
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
        const consoleTransport = createConsoleTransport();

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
