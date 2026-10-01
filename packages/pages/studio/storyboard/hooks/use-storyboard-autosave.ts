'use client';

import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type { StoryboardSourceSelector } from '@genfeedai/contracts/api-types/contracts/storyboard-source.contract';
import type {
  StoryboardAutosaveBinding,
  StoryboardAutosaveOptions,
  StoryboardDraftTransport,
  StoryboardDraftValue,
  StoryboardEditablePlan,
  StoryboardSaveSnapshot,
} from '@genfeedai/props/studio/storyboard.props';
import {
  getStoryboardDraftOutbox,
  storyboardDraftKey,
} from '@pages/studio/storyboard/utils/storyboard-draft-outbox';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const SAVE_DELAY_MS = 1_000;

export function useStoryboardAutosave<T>({
  scope,
  initial,
  save,
  binding,
}: StoryboardAutosaveOptions<T>) {
  const session = useRef({
    scope,
    persisted: initial,
    value: initial.value,
    sequence: 0,
    savedSequence: 0,
    undo: [] as T[],
    skipUndo: false,
  });
  const saveRef = useRef(save);
  saveRef.current = save;
  const controller = useRef(new AbortController());
  const pending = useRef<Promise<StoryboardSaveSnapshot<T>> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [view, setView] = useState({
    scope,
    value: initial.value,
    revision: initial.revision,
    status: 'saved' as 'saved' | 'saving' | 'failed' | 'dirty',
    error: undefined as string | undefined,
    canUndo: false,
  });

  const publish = useCallback(
    (status: 'saved' | 'saving' | 'failed' | 'dirty', error?: string) => {
      const current = session.current;
      setView({
        scope: current.scope,
        value: current.value,
        revision: current.persisted.revision,
        status,
        error,
        canUndo: current.undo.length > 0,
      });
    },
    [],
  );

  const flush = useCallback(async (): Promise<StoryboardSaveSnapshot<T>> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
    if (pending.current) return pending.current;
    const current = session.current;
    const activeController = controller.current;
    const task = async () => {
      while (current.savedSequence < current.sequence) {
        const sequence = current.sequence;
        const value = current.value;
        const skipUndo = current.skipUndo;
        publish('saving');
        try {
          const result = await saveRef.current(
            { revision: current.persisted.revision, value },
            activeController.signal,
          );
          if (activeController.signal.aborted || current !== session.current)
            throw new Error('Storyboard scope changed.');
          if (result.revision <= current.persisted.revision)
            throw new Error('Save did not return a newer revision.');
          if (!skipUndo) current.undo.push(current.persisted.value);
          current.skipUndo = false;
          current.persisted = result;
          current.savedSequence = sequence;
          // Server normalization applies only if the user has not edited during the request.
          if (current.sequence === sequence) current.value = result.value;
          publish(current.sequence === sequence ? 'saved' : 'dirty');
        } catch (error) {
          if (current === session.current && !activeController.signal.aborted)
            publish(
              'failed',
              error instanceof Error
                ? error.message
                : 'Could not save storyboard.',
            );
          throw error;
        }
      }
      return current.persisted;
    };
    // Defer execution so pending is set before a synchronous save callback can settle.
    const promise = Promise.resolve().then(task);
    pending.current = promise;
    try {
      return await promise;
    } finally {
      if (pending.current === promise) pending.current = null;
    }
  }, [publish]);

  const edit = useCallback(
    (update: T | ((value: T) => T)) => {
      const current = session.current;
      current.value =
        typeof update === 'function'
          ? (update as (value: T) => T)(current.value)
          : update;
      current.sequence += 1;
      publish('dirty');
      if (timer.current) return;
      timer.current = setTimeout(() => {
        void flush().catch(() => undefined);
      }, SAVE_DELAY_MS);
    },
    [flush, publish],
  );

  const undo = useCallback(async () => {
    await flush();
    const current = session.current;
    const previous = current.undo.at(-1);
    if (previous === undefined) return current.persisted;
    current.skipUndo = true;
    edit(previous);
    const result = await flush();
    current.undo.pop();
    publish('saved');
    return result;
  }, [edit, flush, publish]);

  useEffect(() => {
    if (session.current.scope !== scope) {
      controller.current.abort();
      controller.current = new AbortController();
      pending.current = null;
      if (timer.current) clearTimeout(timer.current);
      session.current = {
        scope,
        persisted: initial,
        value: initial.value,
        sequence: 0,
        savedSequence: 0,
        undo: [],
        skipUndo: false,
      };
      publish('saved');
    } else if (
      session.current.sequence === session.current.savedSequence &&
      initial.revision > session.current.persisted.revision
    ) {
      session.current.persisted = initial;
      session.current.value = initial.value;
      publish('saved');
    }
  }, [scope, initial, publish]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const current = session.current;
      if (current.sequence === current.savedSequence) return;
      void flush().catch(() => undefined);
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [flush]);

  useEffect(() => {
    if (controller.current.signal.aborted)
      controller.current = new AbortController();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      controller.current.abort();
    };
  }, []);

  return binding ?? { ...view, edit, flush, undo };
}

/** Bind both editable channels to one persistent run queue and one revision. */
export function useStoryboardDraftOutbox(
  transport: StoryboardDraftTransport | undefined,
  run: StoryboardRun,
) {
  const queue = useMemo(
    () => (transport ? getStoryboardDraftOutbox(transport, run) : undefined),
    [transport, run],
  );
  const [snapshot, setSnapshot] = useState(() => queue?.getSnapshot());
  useEffect(() => {
    if (!queue) {
      setSnapshot(undefined);
      return;
    }
    const unsubscribe = queue.subscribe(() => setSnapshot(queue.getSnapshot()));
    setSnapshot(queue.getSnapshot());
    void queue.initialize().catch(() => undefined);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (queue.getSnapshot().status === 'saved') return;
      queue.detach();
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      unsubscribe();
      window.removeEventListener('beforeunload', beforeUnload);
      queue.detach();
    };
  }, [queue]);
  useEffect(() => {
    queue?.adopt(run);
  }, [queue, run]);
  const current = queue?.getSnapshot() ?? snapshot;
  function bind<
    T extends StoryboardDraftValue['plan'] | StoryboardDraftValue['source'],
  >(channel: 'plan' | 'source'): StoryboardAutosaveBinding<T> | undefined {
    if (!queue || !current) return undefined;
    const saved = () => {
      const snapshot = queue.getSnapshot();
      return {
        revision: snapshot.revision,
        value: snapshot.value[channel] as T,
      };
    };
    return {
      scope: storyboardDraftKey(queue.transport.scope),
      value: current.value[channel] as T,
      revision: current.revision,
      status: current.status,
      error: current.error,
      canUndo: current.canUndo,
      edit: (update) => {
        const value = queue.getSnapshot().value[channel] as T;
        queue.edit(
          channel,
          typeof update === 'function' ? update(value) : update,
        );
      },
      flush: async () => {
        await queue.flush();
        return saved();
      },
      undo: async () => {
        await queue.undo();
        return saved();
      },
    };
  }
  return {
    queue,
    snapshot: current,
    plan: bind<StoryboardEditablePlan>('plan'),
    source: bind<StoryboardSourceSelector>('source'),
  };
}
