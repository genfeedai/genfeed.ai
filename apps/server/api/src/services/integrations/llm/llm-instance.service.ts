import { ConfigService } from '@api/config/config.service';
import { getErrorMessage } from '@api/helpers/utils/error/get-error-message.util';
import { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import {
  DescribeInstancesCommand,
  EC2Client,
  StartInstancesCommand,
  StopInstancesCommand,
} from '@aws-sdk/client-ec2';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Injectable } from '@nestjs/common';
import axios from 'axios';

export const LLM_LAST_REQUEST_KEY = 'llm-instance:last-request';

const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const HEALTH_CHECK_TIMEOUT_MS = 90_000; // 90 seconds
const HEALTH_CHECK_INTERVAL_MS = 5_000; // 5 seconds

@Injectable()
export class LlmInstanceService {
  private readonly constructorName = String(this.constructor.name);
  private readonly ec2Client: EC2Client;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly loggerService: LoggerService,
    private readonly pollUntilService: PollUntilService,
  ) {
    const region = String(this.configService.get('AWS_REGION') || 'us-east-1');
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
   * Ensure the LLM EC2 instance is running and vLLM is healthy.
   * No-op if GPU_LLM_INSTANCE_ID or GPU_LLM_URL is not configured.
   */
  async ensureRunning(): Promise<void> {
    const instanceId = String(
      this.configService.get('GPU_LLM_INSTANCE_ID') || '',
    );
    const llmUrl = String(this.configService.get('GPU_LLM_URL') || '');

    if (!instanceId || !llmUrl) {
      this.loggerService.warn(
        `${this.constructorName}: GPU_LLM_INSTANCE_ID or GPU_LLM_URL not configured — skipping instance start`,
      );
      return;
    }

    const state = await this.getInstanceState(instanceId);

    if (state === 'running') {
      await this.touchLastRequest();
      return;
    }

    if (state === 'stopped') {
      this.loggerService.log(
        `${this.constructorName}: Starting LLM instance ${instanceId}`,
      );
      await this.ec2Client.send(
        new StartInstancesCommand({ InstanceIds: [instanceId] }),
      );
    } else {
      this.loggerService.log(
        `${this.constructorName}: Instance is ${state}, waiting for it to stabilize`,
      );
    }

    await this.waitForHealth(llmUrl);
    await this.touchLastRequest();
  }

  /**
   * Update the last-request timestamp in Redis (TTL 1 hour).
   */
  async touchLastRequest(): Promise<void> {
    const redis = this.redisService.getPublisher();
    if (!redis) return;
    await redis.set(LLM_LAST_REQUEST_KEY, String(Date.now()), { EX: 3600 });
  }

  /**
   * Returns true if no LLM request has been made in the last 10 minutes.
   */
  async isIdle(): Promise<boolean> {
    const redis = this.redisService.getPublisher();
    if (!redis) return false;
    const lastRequest = await redis.get(LLM_LAST_REQUEST_KEY);
    if (!lastRequest) return true;
    return Date.now() - Number(lastRequest) > IDLE_TIMEOUT_MS;
  }

  /**
   * Stop the LLM EC2 instance (called by idle shutdown cron).
   */
  async stopInstance(): Promise<void> {
    const instanceId = String(
      this.configService.get('GPU_LLM_INSTANCE_ID') || '',
    );
    if (!instanceId) return;

    this.loggerService.log(
      `${this.constructorName}: Stopping idle LLM instance ${instanceId}`,
    );
    try {
      await this.ec2Client.send(
        new StopInstancesCommand({ InstanceIds: [instanceId] }),
      );
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName}: Failed to stop LLM instance`,
        { error: getErrorMessage(error), instanceId },
      );
    }
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
      this.loggerService.error(
        `${this.constructorName}: Failed to describe EC2 instance`,
        { error: getErrorMessage(error), instanceId },
      );
      return 'unknown';
    }
  }

  private async waitForHealth(llmUrl: string): Promise<void> {
    await this.pollUntilService.poll(
      async () => {
        try {
          await axios.get(`${llmUrl}/v1/health`, { timeout: 5_000 });
          return true;
        } catch {
          this.loggerService.log(
            `${this.constructorName}: Waiting for vLLM health at ${llmUrl}...`,
          );
          return false;
        }
      },
      (healthy) => healthy,
      {
        intervalMs: HEALTH_CHECK_INTERVAL_MS,
        timeoutMs: HEALTH_CHECK_TIMEOUT_MS,
      },
    );
    this.loggerService.log(
      `${this.constructorName}: vLLM health check passed at ${llmUrl}`,
    );
  }
}
