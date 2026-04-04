#!/usr/bin/env bun

/**
 * Workers Startup Script (DEPRECATED)
 *
 * The workers service has been migrated to a proper NestJS app.
 * Use the new service instead:
 *
 *   cd cloud/apps/server/workers && bun run dev
 *
 * Or from cloud root:
 *
 *   bun run dev -- --projects=workers
 */

import { Logger } from '@nestjs/common';

const logger = new Logger('WorkersStart');

logger.error(
  'This script is deprecated. Use the NestJS workers app instead:\n' +
    '  cd cloud/apps/server/workers && bun run dev\n',
);
process.exit(1);
