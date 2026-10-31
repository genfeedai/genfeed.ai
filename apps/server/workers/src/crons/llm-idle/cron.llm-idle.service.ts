import {
  DescribeInstancesCommand,
  EC2Client,
  StopInstancesCommand,
} from '@aws-sdk/client-ec2';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@workers/config/config.service';

const LLM_LAST_REQUEST_KEY = 'llm-instance:last-request';
const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const INSTANCE_NOT_FOUND_CODE = 'InvalidInstanceID.NotFound';

@Injectable()
export class CronLlmIdleService {
  private readonly constructorName = String(this.constructor.name);
  private readonly ec2Client: EC2Client;
  private hasWarnedMissingInstance = false;
  private readonly region: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly loggerService: LoggerService,
  ) {
    const region = String(this.configService.get('AWS_REGION') || 'us-east-1');
    this.region = region;
    this.ec2Client = new EC2Client({
      credentials: {
        accessKeyId: String(this.configService.get('AWS_ACCESS_KEY_ID') || ''),
        secretAccessKey: String(
          this.configService.get('AWS_SECRET_ACCESS_KEY') || '',
        ),
      },
      region,
    });
  }

  /**
   * Every 5 minutes — stop the LLM instance if idle for more than 10 minutes.
   */
  async shutdownIfIdle() {
    const instanceId = String(
      this.configService.get('GPU_LLM_INSTANCE_ID') || '',
    );

    if (!instanceId) {
      return; // LLM instance not configured — skip
    }

    try {
      const idle = await this.isIdle();
      if (!idle) return;

      const state = await this.getInstanceState(instanceId);
      if (state !== 'running') return;

      this.loggerService.log(
        `${this.constructorName}: LLM instance ${instanceId} idle >10min — stopping`,
      );

      await this.ec2Client.send(
        new StopInstancesCommand({ InstanceIds: [instanceId] }),
      );

      this.loggerService.log(
        `${this.constructorName}: LLM instance ${instanceId} stopped successfully`,
      );
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName}: Failed to stop idle LLM instance`,
        { error: getErrorMessage(error), instanceId },
      );
    }
  }

  private async isIdle(): Promise<boolean> {
    const redis = this.redisService.getPublisher();
    if (!redis) return false;
    const lastRequest = await redis.get(LLM_LAST_REQUEST_KEY);
    if (!lastRequest) return true;
    return Date.now() - Number(lastRequest) > IDLE_TIMEOUT_MS;
  }

  private async getInstanceState(instanceId: string): Promise<string> {
    try {
      const response = await this.ec2Client.send(
        new DescribeInstancesCommand({ InstanceIds: [instanceId] }),
      );
      return (
        response.Reservations?.[0]?.Instances?.[0]?.State?.Name ?? 'unknown'
      );
    } catch (error: unknown) {
      if (this.isInstanceNotFound(error)) {
        // An instance missing from this client's region (deleted, or living in
        // another region) is a config problem, not a fault. Warn once instead
        // of an error every cron tick.
        if (!this.hasWarnedMissingInstance) {
          this.hasWarnedMissingInstance = true;
          this.loggerService.warn(
            `${this.constructorName}: GPU_LLM_INSTANCE_ID ${instanceId} was not found in ${this.region} — idle shutdown skipped; check the instance's region (AWS_REGION) or unset GPU_LLM_INSTANCE_ID`,
          );
        }
        return 'not-found';
      }
      this.loggerService.error(
        `${this.constructorName}: Failed to describe EC2 instance`,
        { error: getErrorMessage(error), instanceId },
      );
      return 'unknown';
    }
  }

  private isInstanceNotFound(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.name === INSTANCE_NOT_FOUND_CODE ||
        (error as { Code?: string }).Code === INSTANCE_NOT_FOUND_CODE)
    );
  }
}
