import {
  BaseConfigService,
  baseSchema,
  genfeedaiMinimalSchema,
  type IEnvConfig,
  redisSchema,
  sentryOptionalSchema,
} from '@genfeedai/config';
import { Injectable } from '@nestjs/common';
import Joi from 'joi';

/**
 * MCP service specific schema - minimal config for MCP server
 */
const mcpSchema = Joi.object({
  ...baseSchema,
  ...redisSchema,
  ...sentryOptionalSchema,
  ...genfeedaiMinimalSchema,
  // MCP-specific
  GENFEEDAI_API_KEY: Joi.string().optional().allow(''),
});

@Injectable()
export class ConfigService extends BaseConfigService<IEnvConfig> {
  constructor() {
    super(mcpSchema, {
      appName: 'mcp',
      workingDir: 'apps/server',
    });
  }
}
