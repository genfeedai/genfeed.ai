import { storyboardImportedPlanDraftSchema } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import {
  storyboardIdSchema,
  storyboardSourceSelectorSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-source.contract';
import type {
  StoryboardDraftConflict,
  StoryboardDraftScope,
  StoryboardDraftTransport,
  StoryboardDraftValue,
  StoryboardSaveIndicatorProps,
} from '@genfeedai/props/studio/storyboard.props';
import {
  editableStoryboard,
  reconcileStoryboardDraft,
  storyboardValuesEqual,
} from '@pages/studio/storyboard/utils/storyboard-draft-reconcile';
import {
  getJsonApiErrorMember,
  getJsonApiErrorMessage,
} from '@services/core/json-api-error-message';
import { normalizeOperationError } from '@services/core/operation-error';
import { z } from 'zod';

const scopeSchema = z
  .object({
    server: z.string().min(1),
    userId: z.string().min(1),
    organizationId: z.string().min(1),
    brandId: z.string().min(1),
    runId: z.string().min(1),
  })
  .strict();
const draftValidationSchema = z
  .object({
    plan: storyboardImportedPlanDraftSchema,
    source: storyboardSourceSelectorSchema.or(
      z
        .object({
          kind: z.literal('brief'),
          brief: z.string().max(2000),
          seedImageAssetId: storyboardIdSchema.optional(),
        })
        .strict(),
    ),
  })
  .strict();
// Validate the exact editable snapshot without trimming or replacing incomplete local text.
const valueSchema = z.custom<StoryboardDraftValue>(
  (value) => draftValidationSchema.safeParse(value).success,
);
const pendingSchema = z
  .object({
    channel: z.enum(['plan', 'source']),
    sequence: z.number().int().nonnegative(),
  })
  .strict();
const reviewSchema = z
  .object({
    base: valueSchema,
    local: valueSchema,
    remote: valueSchema,
    choices: z.record(z.string().max(1024), z.enum(['local', 'remote'])),
  })
  .strict();
const envelopeSchema = z
  .object({
    version: z.literal(1),
    scope: scopeSchema,
    revision: z.number().int().positive(),
    base: valueSchema,
    value: valueSchema,
    sequence: z.number().int().nonnegative(),
    pending: z.array(pendingSchema).max(2),
    submitted: z
      .object({ ...pendingSchema.shape, value: valueSchema })
      .strict()
      .optional(),
    recoveryLocal: valueSchema.optional(),
    review: reviewSchema.optional(),
    resolution: reviewSchema.optional(),
  })
  .strict();
export function storyboardDraftKey(scope: StoryboardDraftScope) {
  return `genfeed:storyboard-draft:v1:${JSON.stringify(scopeSchema.parse(scope))}`;
}
export function storyboardDraftValue(run: StoryboardRun): StoryboardDraftValue {
  if (!run.config.plan) throw new Error('Storyboard has no plan.');
  return {
    plan: structuredClone(run.config.plan),
    source: structuredClone(run.config.sourceSnapshot.selector),
  };
}
const queues = new Map<string, StoryboardDraftOutbox>();
export function getStoryboardDraftOutbox(
  transport: StoryboardDraftTransport,
  run: StoryboardRun,
) {
  const key = storyboardDraftKey(transport.scope);
  const existing = queues.get(key);
  if (existing) {
    existing.transport = transport;
    return existing;
  }
  const queue = new StoryboardDraftOutbox(transport, run);
  queues.set(key, queue);
  return queue;
}

/** A captured run queue outlives React; only its subscribers detach on navigation. */
export class StoryboardDraftOutbox {
  transport: StoryboardDraftTransport;
  private envelope: z.infer<typeof envelopeSchema>;
  private listeners = new Set<() => void>();
  private task?: Promise<void>;
  private recovery?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  private initialized = false;
  private status: StoryboardSaveIndicatorProps['status'] = 'dirty';
  private error?: string;
  private storageError?: string;
  private conflicts: StoryboardDraftConflict[] = [];
  private choices: Record<string, 'local' | 'remote'> = {};
  private review?: {
    base: StoryboardDraftValue;
    local: StoryboardDraftValue;
    remote: StoryboardDraftValue;
  };
  private history: StoryboardDraftValue[] = [];
  private snapshot: ReturnType<StoryboardDraftOutbox['view']>;
  constructor(transport: StoryboardDraftTransport, run: StoryboardRun) {
    this.transport = transport;
    const value = storyboardDraftValue(run);
    this.envelope = {
      version: 1,
      scope: transport.scope,
      revision: run.config.revision,
      base: storyboardDraftValue(run),
      value,
      sequence: 0,
      pending: [],
    };
    try {
      const stored = window.sessionStorage.getItem(
        storyboardDraftKey(transport.scope),
      );
      if (stored) {
        const parsed = envelopeSchema.safeParse(JSON.parse(stored));
        if (
          parsed.success &&
          storyboardValuesEqual(parsed.data.scope, transport.scope)
        ) {
          this.envelope = parsed.data;
          this.status = 'dirty';
          if (parsed.data.review) {
            const savedReview = parsed.data.review;
            this.review = {
              base: savedReview.base,
              local: this.envelope.value,
              remote: savedReview.remote,
            };
            this.conflicts = reconcileStoryboardDraft(
              this.review.base,
              this.review.local,
              this.review.remote,
            ).conflicts;
            this.choices = Object.fromEntries(
              Object.entries(savedReview.choices).filter(([path]) =>
                this.conflicts.some((entry) => entry.path === path),
              ),
            );
            if (this.conflicts.length) {
              this.status = 'failed';
              this.error = 'Review concurrent edits before saving.';
            }
          }
        } else
          this.storageError =
            'Saved recovery data could not be read. Recovery is unavailable.';
      }
    } catch {
      this.storageError =
        'Recovery storage is unavailable. Keep this page open until your edits are saved.';
    }
    this.envelope.value = {
      ...this.envelope.value,
      plan: this.withFreshness(this.envelope.value.plan, value.plan),
    };
    this.snapshot = this.view();
  }
  private withFreshness(
    plan: StoryboardDraftValue['plan'],
    remote: StoryboardDraftValue['plan'],
  ): StoryboardDraftValue['plan'] {
    return {
      ...plan,
      shots: plan.shots.map((shot) => ({
        ...shot,
        stillFreshness:
          remote.shots.find(
            (saved) =>
              saved.id === shot.id && saved.stillAssetId === shot.stillAssetId,
          )?.stillFreshness ?? ('missing' as const),
      })),
    } as StoryboardDraftValue['plan'];
  }
  private view() {
    return {
      value: this.envelope.value,
      revision: this.envelope.revision,
      status: this.status,
      error: this.error,
      storageError: this.storageError,
      conflicts: this.conflicts,
      choices: this.choices,
      canUndo: this.history.length > 0,
    };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish() {
    this.snapshot = this.view();
    for (const listener of this.listeners) listener();
  }
  private persist() {
    this.envelope.review = this.review
      ? { ...this.review, choices: this.choices }
      : undefined;
    try {
      const key = storyboardDraftKey(this.transport.scope);
      if (
        !this.envelope.pending.length &&
        !this.envelope.submitted &&
        !this.envelope.recoveryLocal &&
        !this.envelope.review &&
        !this.envelope.resolution
      )
        window.sessionStorage.removeItem(key);
      else window.sessionStorage.setItem(key, JSON.stringify(this.envelope));
      this.storageError = undefined;
    } catch {
      this.storageError =
        'Recovery storage is unavailable. Keep this page open until your edits are saved.';
    }
    this.publish();
  }
  private queue(channel: 'source' | 'plan') {
    this.envelope.sequence += 1;
    this.envelope.pending = [
      ...this.envelope.pending.filter((entry) => entry.channel !== channel),
      { channel, sequence: this.envelope.sequence },
    ];
  }
  edit = (
    channel: 'source' | 'plan',
    value: StoryboardDraftValue['source'] | StoryboardDraftValue['plan'],
  ) => {
    this.envelope.value =
      channel === 'plan'
        ? {
            ...this.envelope.value,
            plan: value as StoryboardDraftValue['plan'],
          }
        : {
            ...this.envelope.value,
            source: value as StoryboardDraftValue['source'],
          };
    this.queue(channel);
    if (this.review) {
      this.review.local = this.envelope.value;
      this.compare(this.review.base, this.review.local, this.review.remote);
    } else this.status = 'dirty';
    // Synchronous write occurs before the debounce or route change.
    this.persist();
    if (!this.timer)
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.flush().catch(() => undefined);
      }, 1000);
  };
  private compare(
    base: StoryboardDraftValue,
    local: StoryboardDraftValue,
    remote: StoryboardDraftValue,
  ) {
    const comparison = reconcileStoryboardDraft(base, local, remote);
    const old = this.conflicts;
    this.choices = Object.fromEntries(
      Object.entries(this.choices).filter(([path]) => {
        const before = old.find((entry) => entry.path === path);
        const after = comparison.conflicts.find((entry) => entry.path === path);
        return (
          before &&
          after &&
          storyboardValuesEqual(before.local, after.local) &&
          storyboardValuesEqual(before.remote, after.remote)
        );
      }),
    );
    this.conflicts = comparison.conflicts;
    if (this.conflicts.length) {
      // Safe disjoint merges and remote-owned freshness remain visible while conflicting units stay local.
      this.envelope.value = comparison.value;
      this.review = { base: comparison.base, local: comparison.value, remote };
      this.envelope.recoveryLocal ??= local;
      this.status = 'failed';
      this.error = 'Review concurrent edits before saving.';
    } else {
      this.envelope.value = comparison.value;
      this.review = undefined;
      this.choices = {};
      this.status = this.envelope.pending.length ? 'dirty' : 'saved';
      this.error = undefined;
    }
  }
  /** Always fetch after uncertain writes, and before restoring a persisted envelope. */
  private async reread() {
    if (!(await this.transport.canDispatch()))
      throw new Error(
        'Saving is paused until you return to this account, organization and server.',
      );
    const run = await this.transport.read();
    this.checkRun(run);
    const remote = storyboardDraftValue(run);
    const submitted = this.envelope.submitted;
    // An unresolved conflict keeps its original three-way lineage across rereads and remounts.
    let base = this.review?.base ?? this.envelope.base;
    if (
      submitted &&
      storyboardValuesEqual(
        editableStoryboard(submitted.value)[submitted.channel],
        editableStoryboard(remote)[submitted.channel],
      )
    ) {
      this.envelope.pending = this.envelope.pending.filter(
        (entry) =>
          entry.channel !== submitted.channel ||
          entry.sequence > submitted.sequence,
      );
      base = {
        ...base,
        [submitted.channel]: submitted.value[submitted.channel],
      };
    }
    this.compare(base, this.envelope.value, remote);
    this.envelope.base = remote;
    this.envelope.revision = run.config.revision;
    this.envelope.submitted = undefined;
    this.envelope.pending = this.envelope.pending.filter(
      (entry) =>
        !storyboardValuesEqual(
          editableStoryboard(this.envelope.value)[entry.channel],
          editableStoryboard(remote)[entry.channel],
        ),
    );
    if (!this.conflicts.length && !this.envelope.pending.length) {
      this.status = 'saved';
      this.envelope.recoveryLocal = undefined;
      this.envelope.resolution = undefined;
    }
    this.initialized = true;
    this.persist();
  }
  private checkRun(run: StoryboardRun) {
    const scope = this.transport.scope;
    if (
      run.id !== scope.runId ||
      run.organizationId !== scope.organizationId ||
      run.brandId !== scope.brandId
    )
      throw new Error('Storyboard response belongs to another scope.');
  }
  initialize = async () => {
    if (!this.task) await this.recover();
  };
  recover = async (): Promise<void> => {
    if (this.task) return this.task;
    if (this.recovery) return this.recovery;
    if (!this.conflicts.length) {
      this.status = 'saving';
      this.publish();
    }
    const recovery = this.reread().catch((error) => {
      this.status = 'failed';
      this.error = getJsonApiErrorMessage(
        error,
        'Could not reconcile saved edits. Your recovery draft is retained.',
      );
      this.persist();
      throw error;
    });
    this.recovery = recovery;
    try {
      await recovery;
    } finally {
      if (this.recovery === recovery) this.recovery = undefined;
    }
  };
  choose = (path: string, choice: 'local' | 'remote') => {
    this.choices = { ...this.choices, [path]: choice };
    this.persist();
  };
  resolve = async () => {
    if (
      !this.review ||
      this.conflicts.some((entry) => !this.choices[entry.path])
    )
      throw new Error('Choose a version for every conflicting field.');
    this.envelope.recoveryLocal = this.review.local;
    this.envelope.resolution = { ...this.review, choices: this.choices };
    const resolved = reconcileStoryboardDraft(
      this.review.base,
      this.review.local,
      this.review.remote,
      this.choices,
    ).value;
    this.envelope.value = resolved;
    this.review = undefined;
    this.conflicts = [];
    this.status = 'dirty';
    this.error = undefined;
    for (const channel of ['plan', 'source'] as const)
      if (
        !storyboardValuesEqual(
          editableStoryboard(resolved)[channel],
          editableStoryboard(this.envelope.base)[channel],
        )
      )
        this.queue(channel);
    this.persist();
    await this.flush();
  };
  flush = async (): Promise<void> => {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.recovery) await this.recovery;
    if (this.task) return this.task;
    const task = Promise.resolve()
      .then(async () => {
        if (!this.initialized || this.envelope.submitted) await this.reread();
        if (this.conflicts.length)
          throw new Error('Resolve concurrent edits before saving.');
        while (this.envelope.pending.length) {
          if (!(await this.transport.canDispatch()))
            throw new Error(
              'Saving is paused until you return to this account, organization and server.',
            );
          const entry = this.envelope.pending[0];
          const previous = this.envelope.base;
          // Unsubmitted changes in the other channel are not attributed to this PATCH.
          const submittedValue: StoryboardDraftValue =
            entry.channel === 'plan'
              ? { ...previous, plan: this.envelope.value.plan }
              : { ...previous, source: this.envelope.value.source };
          submittedValue.plan = this.withFreshness(
            submittedValue.plan,
            previous.plan,
          );

          this.envelope.submitted = { ...entry, value: submittedValue };
          this.status = 'saving';
          this.error = undefined;
          this.persist();
          try {
            const run = await this.transport.write(
              entry.channel,
              this.envelope.revision,
              submittedValue,
            );
            this.checkRun(run);
            if (run.config.revision <= this.envelope.revision)
              throw new Error('Save did not acknowledge a newer revision.');
            this.history.push(previous);
            this.envelope.pending = this.envelope.pending.filter(
              (pending) =>
                pending.channel !== entry.channel ||
                pending.sequence > entry.sequence,
            );
            this.compare(
              submittedValue,
              this.envelope.value,
              storyboardDraftValue(run),
            );
            this.envelope.base = storyboardDraftValue(run);
            this.envelope.revision = run.config.revision;
            this.envelope.submitted = undefined;
            if (!this.envelope.pending.length && !this.conflicts.length) {
              this.status = 'saved';
              this.envelope.recoveryLocal = undefined;
              this.envelope.resolution = undefined;
            }
            this.persist();
            if (this.conflicts.length)
              throw new Error('Review concurrent edits before saving.');
          } catch (error) {
            const member = getJsonApiErrorMember(error);
            const status =
              member?.status ??
              normalizeOperationError('save-storyboard', error).status;
            const ambiguous =
              !status || [408, 429].includes(status) || status >= 500;
            if (
              this.envelope.submitted &&
              (status === 409 ||
                member?.code === 'STORYBOARD_CAPABILITIES_CHANGED' ||
                ambiguous)
            ) {
              await this.reread();
              // Pause here: acknowledgement may finish, otherwise explicit Retry uses the refreshed revision.
              if (this.status !== 'saved') {
                this.status = 'failed';
                this.error ??= this.conflicts.length
                  ? 'Review concurrent edits before saving.'
                  : member?.code === 'STORYBOARD_CAPABILITIES_CHANGED'
                    ? getJsonApiErrorMessage(
                        error,
                        'Model capabilities changed. Review durations and retry.',
                      )
                    : 'Saved version refreshed. Retry to save your retained edits.';
              }
              this.persist();
              if (this.status === 'saved') return;
            } else {
              this.envelope.submitted = undefined;
              this.status = 'failed';
              this.error = getJsonApiErrorMessage(
                error,
                'Could not save. Your edits are retained.',
              );
              this.persist();
            }
            throw error;
          }
        }
      })
      .catch((error) => {
        if (this.status !== 'failed') {
          this.status = 'failed';
          this.error = getJsonApiErrorMessage(
            error,
            'Could not save storyboard.',
          );
          this.persist();
        }
        throw error;
      });
    this.task = task;
    try {
      await task;
    } finally {
      if (this.task === task) this.task = undefined;
    }
  };
  detach = () => {
    void this.flush().catch(() => undefined);
  };
  undo = async () => {
    await this.flush();
    const previous = this.history.pop();
    if (previous) {
      this.edit('plan', previous.plan);
      await this.flush();
    }
  };
  adopt = (run: StoryboardRun) => {
    this.checkRun(run);
    if (run.config.revision < this.envelope.revision) return;
    if (!run.config.plan) throw new Error('Storyboard has no plan.');
    this.envelope.value = {
      ...this.envelope.value,
      plan: this.withFreshness(this.envelope.value.plan, run.config.plan),
    };
    this.publish();
    if (
      !this.envelope.pending.length &&
      !this.envelope.submitted &&
      run.config.revision > this.envelope.revision
    ) {
      this.envelope.base = storyboardDraftValue(run);
      this.envelope.value = this.envelope.base;
      this.envelope.revision = run.config.revision;
      this.persist();
    }
  };
}
