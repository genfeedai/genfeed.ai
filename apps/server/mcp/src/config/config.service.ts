import {
  createServiceConfig,
  genfeedaiMinimalSchema,
  type IEnvConfig,
  redisSchema,
  sentryOptionalSchema,
  webhooksSchema,
} from '@genfeedai/config';
import { Injectable } from '@nestjs/common';
import Joi from 'joi';

@Injectable()
export class ConfigService extends createServiceConfig<IEnvConfig>({
  appName: 'mcp',
  // #484: main.ts reads CHROME_EXTENSION_ID for CORS but the schema never
  // validated it; webhooksSchema is its canonical home (length-32 constraint).
  schemas: [
    redisSchema,
    sentryOptionalSchema,
    genfeedaiMinimalSchema,
    webhooksSchema,
  ],
  extend: {
    // MCP-specific
    GENFEEDAI_API_KEY: Joi.string().optional().allow(''),
    // Per-caller request cap for the MCP transport (sliding window). Keyed by
    // hashed bearer token, or client IP for unauthenticated requests.
    MCP_RATE_LIMIT_PER_MINUTE: Joi.number().min(1).default(60),
    MCP_RATE_LIMIT_WINDOW_MS: Joi.number().min(1000).default(60000),
  },
}) {}
