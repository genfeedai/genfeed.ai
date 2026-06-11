import {
  createServiceConfig,
  genfeedaiMinimalSchema,
  type IEnvConfig,
  redisSchema,
  sentryOptionalSchema,
} from '@genfeedai/config';
import { Injectable } from '@nestjs/common';
import Joi from 'joi';

@Injectable()
export class ConfigService extends createServiceConfig<IEnvConfig>({
  appName: 'mcp',
  schemas: [redisSchema, sentryOptionalSchema, genfeedaiMinimalSchema],
  extend: {
    // MCP-specific
    GENFEEDAI_API_KEY: Joi.string().optional().allow(''),
  },
}) {}
