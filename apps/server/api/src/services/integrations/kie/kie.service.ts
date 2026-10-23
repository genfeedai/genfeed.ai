import { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import { ConfigService } from '@libs/config/config.service';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';

const taskResponse = z.object({
  code: z.number(),
  msg: z.string().optional(),
  data: z
    .object({
      taskId: z.string().min(1),
      state: z.string().optional(),
      resultJson: z.string().nullable().optional(),
      failMsg: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});
const outputsSchema = z.object({ resultUrls: z.array(z.url()).min(1) });

@Injectable()
export class KieService {
  constructor(
    private readonly config: ConfigService,
    private readonly polling: PollUntilService,
  ) {}

  async generateVideo(
    model: string,
    input: Record<string, unknown>,
    onStarted?: () => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const apiKey = this.config.get<string>('KIE_API_KEY');
    if (!apiKey)
      throw new ServiceUnavailableException('Kie.ai is not configured');
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    onStarted?.();
    const submitted = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, input }),
      signal: AbortSignal.any([
        AbortSignal.timeout(30000),
        ...(signal ? [signal] : []),
      ]),
    });
    if (!submitted.ok)
      throw new ServiceUnavailableException(
        `Kie.ai submission returned ${submitted.status}`,
      );
    const created = taskResponse.parse(await submitted.json());
    if (created.code !== 200 || !created.data)
      throw new ServiceUnavailableException('Kie.ai rejected the generation');
    const taskId = created.data.taskId;
    const result = await this.polling.poll(
      async () => {
        const response = await fetch(
          `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
          {
            headers,
            signal: AbortSignal.any([
              AbortSignal.timeout(30000),
              ...(signal ? [signal] : []),
            ]),
          },
        );
        if (!response.ok)
          throw new ServiceUnavailableException(
            `Kie.ai polling returned ${response.status}`,
          );
        const task = taskResponse.parse(await response.json());
        if (task.code !== 200 || !task.data || task.data.taskId !== taskId)
          throw new ServiceUnavailableException(
            'Kie.ai returned an invalid task receipt',
          );
        if (task.data.state === 'fail')
          throw new ServiceUnavailableException('Kie.ai generation failed');
        return task.data;
      },
      (task) => task.state === 'success',
      { timeoutMs: 600000, intervalMs: 3000, signal },
    );
    const output = outputsSchema.parse(
      JSON.parse(result.value.resultJson ?? '{}'),
    ).resultUrls[0];
    if (!output || new URL(output).protocol !== 'https:')
      throw new ServiceUnavailableException(
        'Kie.ai returned an invalid output URL',
      );
    return output;
  }
}
