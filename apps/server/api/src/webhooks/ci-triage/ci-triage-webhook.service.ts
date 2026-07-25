import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { safeFetch } from '@libs/security/destination-guard';
import { Injectable } from '@nestjs/common';

export interface CiTriagePayload {
  repo: string;
  runId: string;
  prNumber: number;
  failedJobs: Array<{ name: string; failedSteps: string[] }>;
  logExcerpt: string;
}

const MAX_DIAGNOSES_PER_PR = 5;
const ANTHROPIC_API_ORIGIN = 'https://api.anthropic.com';
const GITHUB_API_ORIGIN = 'https://api.github.com';

@Injectable()
export class CiTriageWebhookService {
  private readonly constructorName = String(this.constructor.name);
  /** Tracks how many times we've diagnosed a given PR. Resets on deploy. */
  private readonly diagnosisCount = new Map<number, number>();

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  async diagnoseAndComment(payload: CiTriagePayload): Promise<void> {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    const githubToken = this.configService.get<string>('GITHUB_TOKEN');

    if (!apiKey) {
      this.loggerService.error(
        `${this.constructorName}: ANTHROPIC_API_KEY not configured — skipping triage`,
      );
      return;
    }

    if (!githubToken) {
      this.loggerService.error(
        `${this.constructorName}: GITHUB_TOKEN not configured — cannot post PR comment`,
      );
      return;
    }

    const count = this.diagnosisCount.get(payload.prNumber) ?? 0;
    if (count >= MAX_DIAGNOSES_PER_PR) {
      this.loggerService.warn(
        `${this.constructorName}: PR #${payload.prNumber} has hit the ${MAX_DIAGNOSES_PER_PR}-diagnosis limit — skipping to avoid token burn`,
      );
      return;
    }
    this.diagnosisCount.set(payload.prNumber, count + 1);

    const prompt = `You are a CI triage agent for a NestJS/Next.js monorepo (genfeedai/cloud).

Failed jobs: ${JSON.stringify(payload.failedJobs, null, 2)}

Log excerpt:
\`\`\`
${payload.logExcerpt.slice(0, 8000)}
\`\`\`

Provide a concise diagnosis:
1. Root cause (1-2 sentences)
2. Category: type-error | lint | test-failure | build-error | dependency | timeout | flaky
3. Specific fix suggestion
4. Files likely involved (list)

Be direct and actionable. No preamble.`;

    try {
      const response = await safeFetch(
        `${ANTHROPIC_API_ORIGIN}/v1/messages`,
        {
          body: JSON.stringify({
            max_tokens: 1024,
            messages: [{ content: prompt, role: 'user' }],
            model: 'claude-opus-4-6',
          }),
          headers: {
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'x-api-key': String(apiKey),
          },
          method: 'POST',
        },
        { allowedOrigins: [ANTHROPIC_API_ORIGIN] },
      );

      const result = (await response.json()) as {
        content?: Array<{ text?: string }>;
      };
      const diagnosis = result.content?.[0]?.text ?? 'Diagnosis unavailable';

      const comment = [
        '## 🔧 CI Triage (Opus 4.6)',
        '',
        diagnosis,
        '',
        `[→ View full run](https://github.com/${payload.repo}/actions/runs/${payload.runId})`,
        '',
        '---',
        '*Diagnosed automatically via Claude Opus 4.6*',
      ].join('\n');

      // Post comment via GitHub REST API (replaces execSync shell-out to gh CLI)
      const repositorySegments = payload.repo.split('/');
      if (
        repositorySegments.length !== 2 ||
        repositorySegments.some((segment) => !segment)
      ) {
        throw new Error('CI triage repository must use the owner/name format');
      }
      const repositoryPath = repositorySegments
        .map((segment) => encodeURIComponent(segment))
        .join('/');

      const ghResponse = await safeFetch(
        `${GITHUB_API_ORIGIN}/repos/${repositoryPath}/issues/${payload.prNumber}/comments`,
        {
          body: JSON.stringify({ body: comment }),
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${githubToken}`,
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          method: 'POST',
        },
        { allowedOrigins: [GITHUB_API_ORIGIN] },
      );

      if (!ghResponse.ok) {
        const errorBody = await ghResponse.text();
        throw new Error(
          `GitHub API returned ${ghResponse.status}: ${errorBody}`,
        );
      }

      this.loggerService.log(
        `${this.constructorName}: CI triage complete for PR #${payload.prNumber}`,
      );
    } catch (error) {
      this.loggerService.error(
        `${this.constructorName}: CI triage failed for PR #${payload.prNumber}`,
        error,
      );
    }
  }
}
