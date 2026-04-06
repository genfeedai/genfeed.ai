import {
  isTerminalRunStatus,
  type RunActionType,
  type RunEventRecord,
  type RunRecord,
  type RunsService,
} from '~services/runs.service';

export interface RunProgressSnapshot {
  events: RunEventRecord[];
  run: RunRecord;
}

export interface ExecuteRunLoopOptions {
  actionType: RunActionType;
  correlationId?: string;
  idempotencyKey?: string;
  input: Record<string, unknown>;
  maxPolls?: number;
  metadata?: Record<string, unknown>;
  onUpdate?: (snapshot: RunProgressSnapshot) => void;
  pollIntervalMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_MAX_POLLS = 120;
const DEFAULT_POLL_INTERVAL_MS = 1500;

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Run monitoring aborted.');
  }
}

function getRunId(run: RunRecord): string {
  const runId = run._id || run.id;
  if (!runId) {
    throw new Error('Run id missing from response.');
  }
  return runId;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class ContentEngineService {
  constructor(private readonly runsService: RunsService) {}

  async executeRunLoop(
    options: ExecuteRunLoopOptions,
  ): Promise<RunProgressSnapshot> {
    const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const maxPolls = options.maxPolls ?? DEFAULT_MAX_POLLS;

    assertNotAborted(options.signal);

    const initialRun = await this.runsService.createAndExecuteRun(
      options.actionType,
      options.input,
      {
        correlationId: options.correlationId,
        idempotencyKey: options.idempotencyKey,
        metadata: options.metadata,
      },
    );

    const runId = getRunId(initialRun);
    let currentRun = initialRun;
    let currentEvents = await this.safeGetRunEvents(runId);

    options.onUpdate?.({
      events: currentEvents,
      run: currentRun,
    });

    let pollCount = 0;

    while (!isTerminalRunStatus(currentRun.status)) {
      assertNotAborted(options.signal);

      if (pollCount >= maxPolls) {
        throw new Error(
          `Run ${runId} did not reach a terminal state after ${maxPolls} polls.`,
        );
      }

      pollCount += 1;
      await delay(pollIntervalMs);

      const [nextRun, nextEvents] = await Promise.all([
        this.runsService.getRun(runId),
        this.safeGetRunEvents(runId),
      ]);

      currentRun = nextRun;
      currentEvents = nextEvents;

      options.onUpdate?.({
        events: currentEvents,
        run: currentRun,
      });
    }

    return {
      events: currentEvents,
      run: currentRun,
    };
  }

  private async safeGetRunEvents(runId: string): Promise<RunEventRecord[]> {
    try {
      return await this.runsService.getRunEvents(runId);
    } catch {
      return [];
    }
  }
}
