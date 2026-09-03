import { Injectable } from '@nestjs/common';

type LaneTask<T> = () => Promise<T>;

@Injectable()
export class AgentExecutionLaneService {
  private readonly lanes = new Map<string, Promise<unknown>>();

  async runExclusive<T>(laneKey: string, task: LaneTask<T>): Promise<T> {
    const previous = this.lanes.get(laneKey) ?? Promise.resolve();

    let releaseCurrentLane: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      releaseCurrentLane = resolve;
    });

    const next = previous.catch(() => undefined).then(() => current);

    this.lanes.set(laneKey, next);

    try {
      await previous.catch(() => undefined);

      return await task();
    } finally {
      releaseCurrentLane?.();

      if (this.lanes.get(laneKey) === next) {
        this.lanes.delete(laneKey);
      }
    }
  }
}
