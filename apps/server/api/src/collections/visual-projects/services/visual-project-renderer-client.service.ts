import {
  VISUAL_CODE_LIMITS,
  VISUAL_CODE_RENDERER_VERSION,
} from '@genfeedai/contracts/constants';
import type {
  IVisualSandboxExecution,
  IVisualSandboxInput,
  IVisualSandboxReceipt,
  IVisualSandboxResult,
} from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';

const receiptSchema = z.object({
  id: z.string(),
  inputHash: z.string(),
  sourceHash: z.string(),
  status: z.enum(['running', 'completed', 'failed', 'cancelled']),
  startedAt: z.number(),
  finishedAt: z.number().optional(),
  computeSeconds: z.number().finite().min(0),
  diagnostic: z.string().max(8192).optional(),
  isComputeIndeterminate: z.boolean().optional(),
});
const resultSchema = z.strictObject({
  rendererVersion: z.literal(VISUAL_CODE_RENDERER_VERSION),
  media: z
    .array(
      z.strictObject({
        format: z.enum(['mp4', 'png', 'jpeg']),
        width: z.number().int(),
        height: z.number().int(),
        frame: z.number().int().optional(),
        bytes: z.string(),
      }),
    )
    .max(8),
  diagnostics: z.array(z.string()).max(8),
});
@Injectable()
export class VisualProjectRendererClientService {
  constructor(private readonly config: ConfigService) {}
  configuration() {
    const endpoint = this.config.get('VISUAL_CODE_RENDERER_URL');
    const token = this.config.get('VISUAL_CODE_RENDERER_TOKEN');
    const rate = Number(
      this.config.get('VISUAL_CODE_RENDER_CREDITS_PER_SECOND'),
    );
    if (
      this.config.get('VISUAL_CODE_RENDERER_ENABLED') !== 'true' ||
      typeof endpoint !== 'string' ||
      !endpoint ||
      typeof token !== 'string' ||
      !token ||
      !Number.isFinite(rate) ||
      rate < 0
    )
      throw new ServiceUnavailableException('visual_code_renderer_unavailable');
    const url = new URL(endpoint);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      (url.protocol !== 'https:' &&
        !(
          url.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        ))
    )
      throw new ServiceUnavailableException(
        'visual_code_renderer_configuration_invalid',
      );
    return { endpoint: url.origin, token, rate };
  }
  private async request(
    path: string,
    method = 'GET',
    body?: unknown,
  ): Promise<Response> {
    const config = this.configuration();
    const response = await fetch(`${config.endpoint}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${config.token}`,
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const detail =
        response.status === 503
          ? await response.json().catch(() => null)
          : null;
      throw new ServiceUnavailableException(
        detail?.error === 'renderer_busy'
          ? 'renderer_busy'
          : `visual_renderer_http_${response.status}`,
      );
    }
    return response;
  }
  async availability() {
    try {
      const config = this.configuration();
      const health = await (await this.request('/health')).json();
      if (
        health.isReady !== true ||
        health.rendererVersion !== VISUAL_CODE_RENDERER_VERSION
      )
        throw new Error('unavailable');
      return {
        isAvailable: true,
        unavailableReason: null,
        creditsPerSecond: config.rate,
      };
    } catch {
      return {
        isAvailable: false,
        unavailableReason: 'visual_code_renderer_unavailable',
        creditsPerSecond: null,
      };
    }
  }
  async submit(input: IVisualSandboxInput): Promise<IVisualSandboxReceipt> {
    if (
      Buffer.byteLength(JSON.stringify(input)) > VISUAL_CODE_LIMITS.inputBytes
    )
      throw new ServiceUnavailableException('visual_renderer_input_limit');
    return receiptSchema.parse(
      await (await this.request('/jobs', 'POST', input)).json(),
    );
  }
  async status(id: string): Promise<IVisualSandboxReceipt> {
    return receiptSchema.parse(
      await (await this.request(`/jobs/${encodeURIComponent(id)}`)).json(),
    );
  }
  async cancel(id: string): Promise<void> {
    await this.request(`/jobs/${encodeURIComponent(id)}/cancel`, 'POST');
  }
  async recoverStopped(id: string): Promise<IVisualSandboxReceipt | null> {
    let receipt: IVisualSandboxReceipt;
    try {
      receipt = await this.status(id);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'visual_renderer_http_404'
      )
        return null;
      throw error;
    }
    const deadline = Date.now() + VISUAL_CODE_LIMITS.deadlineMs + 15_000;
    while (receipt.status === 'running') {
      await this.cancel(id);
      if (Date.now() >= deadline)
        throw new ServiceUnavailableException(
          'visual_renderer_receipt_unavailable',
        );
      await new Promise((resolve) => setTimeout(resolve, 500));
      receipt = await this.status(id);
    }
    return receipt;
  }
  async result(id: string): Promise<IVisualSandboxResult> {
    const response = await this.request(
      `/jobs/${encodeURIComponent(id)}/result`,
    );
    const reader = response.body?.getReader();
    if (!reader)
      throw new ServiceUnavailableException('visual_renderer_missing_result');
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        length += next.value.length;
        if (length > VISUAL_CODE_LIMITS.resultBytes + 4)
          throw new Error('result_limit');
        chunks.push(next.value);
      }
    } finally {
      await reader.cancel();
    }
    const bytes = Buffer.concat(chunks);
    if (bytes.length < 4 || bytes.readUInt32BE(0) !== bytes.length - 4)
      throw new ServiceUnavailableException('visual_renderer_invalid_frame');
    const result = resultSchema.parse(
      JSON.parse(bytes.subarray(4).toString('utf8')),
    );
    if (
      Buffer.byteLength(JSON.stringify(result.diagnostics)) >
      VISUAL_CODE_LIMITS.diagnosticBytes
    )
      throw new ServiceUnavailableException(
        'visual_renderer_diagnostics_limit',
      );
    return result;
  }
  async execute(
    input: IVisualSandboxInput,
    isCancelled: () => Promise<boolean>,
  ): Promise<IVisualSandboxExecution> {
    const admissionDeadline = Date.now() + 120_000;
    let receipt: IVisualSandboxReceipt | undefined;
    while (!receipt) {
      if (await isCancelled())
        throw new ServiceUnavailableException(
          'visual_code_cancelled_before_start',
        );
      try {
        receipt = await this.submit(input);
      } catch (error) {
        if (
          !(error instanceof Error) ||
          error.message !== 'renderer_busy' ||
          Date.now() >= admissionDeadline
        )
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    const deadline = Date.now() + VISUAL_CODE_LIMITS.deadlineMs + 15_000;
    while (receipt.status === 'running') {
      if ((await isCancelled()) || Date.now() > deadline)
        await this.cancel(input.id);
      await new Promise((resolve) => setTimeout(resolve, 500));
      receipt = await this.status(input.id);
      if (Date.now() > deadline + 15_000)
        throw new ServiceUnavailableException(
          'visual_renderer_receipt_unavailable',
        );
    }
    return {
      receipt,
      result:
        receipt.status === 'completed' || receipt.diagnostic === 'render_failed'
          ? await this.result(input.id)
          : null,
    };
  }
}
