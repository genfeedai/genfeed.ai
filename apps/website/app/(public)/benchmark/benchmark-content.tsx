'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import type {
  BenchmarkContestant,
  BenchmarkData,
  BenchmarkTask,
} from '@public/benchmark/benchmark-loader';
import { BENCHMARK_REPO_URL } from '@public/benchmark/benchmark-loader';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import PageLayout from '@web-components/PageLayout';
import { ArrowRight, RefreshCw } from 'lucide-react';

interface BenchmarkContentProps {
  data: BenchmarkData | null;
}

const STATE_COPY: Record<string, string> = {
  announced: 'Announced',
  closed: 'Closed',
  open: 'Open',
};

const LABEL_CLASS =
  'text-xs font-bold uppercase tracking-[0.16em] text-surface/55';

function SeasonSignal({ data }: BenchmarkContentProps) {
  const runnableTasks = data?.tasks.filter((task) => !task.isDraft).length ?? 0;

  return (
    <div className="w-full max-w-xl border-l border-edge/10 pl-7 sm:pl-10">
      <Text className={LABEL_CLASS}>
        {data ? STATE_COPY[data.season.state] : 'Season'}
      </Text>
      {data ? (
        <div className="mt-6 grid grid-cols-3 gap-5">
          {[
            { label: 'Tasks', value: runnableTasks },
            { label: 'Contestants', value: data.season.contestantIds.length },
            { label: 'Matches', value: data.season.matchCount },
          ].map((item) => (
            <div key={item.label}>
              <Text className="text-4xl font-semibold tracking-[-0.05em] text-surface sm:text-5xl">
                {item.value}
              </Text>
              <Text className="mt-2 text-xs uppercase tracking-[0.12em] text-surface/50">
                {item.label}
              </Text>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 flex items-center gap-3 text-surface/65">
          <RefreshCw className="size-5" />
          <Text>Bench data unavailable</Text>
        </div>
      )}
      <Text className="mt-7 max-w-md text-sm leading-6 text-surface/60">
        Read from the public bench repository. Nothing on this page is
        maintained by hand.
      </Text>
    </div>
  );
}

function Ladder({ data }: { data: BenchmarkData }) {
  const { season } = data;
  const labelFor = (id: string): BenchmarkContestant | undefined =>
    data.contestants.find((one) => one.id === id);

  if (season.ladder.length === 0) {
    return (
      <div className="max-w-3xl border-y border-edge/10 py-16">
        <Text className={LABEL_CLASS}>No matches yet</Text>
        <Heading
          as="h2"
          className="mt-5 text-4xl font-semibold tracking-[-0.04em] text-surface"
        >
          The ladder is empty on purpose.
        </Heading>
        <Text className="mt-5 max-w-xl text-base leading-7 text-surface/65">
          {season.title} is announced with {season.contestantIds.length}{' '}
          contestants entered and no match recorded. Ranking models that have
          never met would be inventing a result, so there is nothing here until
          the first verdict lands in the journal.
        </Text>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Contestant</TableHead>
            <TableHead>Elo</TableHead>
            <TableHead>Matches</TableHead>
            <TableHead>W–L</TableHead>
            <TableHead>Void</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {season.ladder.map((entry) => {
            const contestant = labelFor(entry.contestantId);

            return (
              <TableRow key={entry.contestantId}>
                <TableCell>{entry.rank}</TableCell>
                <TableCell>
                  <span className="font-medium text-surface">
                    {contestant?.label ?? entry.contestantId}
                  </span>
                  {contestant?.isCompiled ? (
                    <span className="ml-2 rounded-full border border-edge/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-surface/60">
                      Genfeed
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>{entry.rating}</TableCell>
                <TableCell>{entry.matches}</TableCell>
                <TableCell>
                  {entry.wins}–{entry.losses}
                </TableCell>
                <TableCell>{entry.voids}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function TaskCard({ task }: { task: BenchmarkTask }) {
  return (
    <div className="border-t border-edge/10 py-10">
      <div className="flex flex-wrap items-center gap-3">
        <Heading
          as="h3"
          className="text-2xl font-semibold tracking-[-0.03em] text-surface"
        >
          {task.title}
        </Heading>
        <span className="rounded-full border border-edge/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-surface/60">
          {task.medium}
        </span>
        {task.isDraft ? (
          <span className="rounded-full border border-edge/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-surface/60">
            Season Two draft
          </span>
        ) : null}
      </div>
      <Text className="mt-4 max-w-2xl text-base leading-7 text-surface/65">
        {task.rationale}
      </Text>
      <Text className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-surface/40">
        The prompt, in full
      </Text>
      <Text className="mt-3 max-w-2xl whitespace-pre-line border-l border-edge/20 pl-5 font-mono text-sm leading-6 text-surface/70">
        {task.prompt}
      </Text>
      <Text className="mt-5 text-sm text-surface/50">
        {task.outputSpec.count}{' '}
        {task.outputSpec.count === 1 ? 'output' : 'outputs'} ·{' '}
        {task.outputSpec.aspectRatio}
        {task.outputSpec.durationSeconds
          ? ` · ${task.outputSpec.durationSeconds}s`
          : ''}{' '}
        · references: {task.referenceRoles.join(', ')}
      </Text>
    </div>
  );
}

export default function BenchmarkContent({ data }: BenchmarkContentProps) {
  const containerRef = useMarketingEntrance();

  const imageTasks = data?.tasks.filter((task) => !task.isDraft) ?? [];
  const draftTasks = data?.tasks.filter((task) => task.isDraft) ?? [];

  return (
    <div ref={containerRef}>
      <PageLayout
        compact
        description="An independent benchmark for image and video generation models. Public tasks, blind judging, and a match journal anyone can re-run. Genfeed competes; it does not score itself."
        heroActions={
          <>
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'open_bench_repo' }}
              trackingName="benchmark_hero_click"
            >
              <a href={BENCHMARK_REPO_URL} rel="noreferrer" target="_blank">
                Read the bench
                <ArrowRight className="size-4" />
              </a>
            </ButtonTracked>
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'start_creating_benchmark' }}
              trackingName="benchmark_hero_click"
              variant={ButtonVariant.SECONDARY}
            >
              <a href={`${EnvironmentService.apps.app}/sign-up`}>
                Start creating
              </a>
            </ButtonTracked>
          </>
        }
        heroVisual={<SeasonSignal data={data} />}
        title="Benchmark"
      >
        {data === null ? (
          <section className="container mx-auto px-6 pb-32">
            <div className="max-w-3xl border-y border-edge/10 py-16">
              <Text className={LABEL_CLASS}>Bench unavailable</Text>
              <Heading
                as="h2"
                className="mt-5 text-4xl font-semibold tracking-[-0.04em] text-surface"
              >
                The bench could not be read.
              </Heading>
              <Text className="mt-5 max-w-xl text-base leading-7 text-surface/65">
                This page never substitutes a cached or hand-written ladder. The
                data lives in the public repository and will render again when
                it can be reached.
              </Text>
            </div>
          </section>
        ) : (
          <div className="container mx-auto px-6 pb-32">
            <section className="mb-20">
              <div className="mb-10 flex flex-col justify-between gap-6 border-b border-edge/10 pb-10 sm:flex-row sm:items-end">
                <div>
                  <Text className={LABEL_CLASS}>{data.season.title}</Text>
                  <Heading
                    as="h2"
                    className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-surface sm:text-5xl"
                  >
                    Standings.
                  </Heading>
                </div>
                <Text className="max-w-md text-sm leading-6 text-surface/60">
                  Elo from recorded pairwise matches only. A voided match is
                  counted and shown but never moves a rating.
                </Text>
              </div>
              <Ladder data={data} />
            </section>

            <section className="mb-20">
              <div className="mb-4 flex flex-col justify-between gap-6 border-b border-edge/10 pb-10 sm:flex-row sm:items-end">
                <div>
                  <Text className={LABEL_CLASS}>The suite</Text>
                  <Heading
                    as="h2"
                    className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-surface sm:text-5xl"
                  >
                    What we ask models to make.
                  </Heading>
                </div>
                <Text className="max-w-md text-sm leading-6 text-surface/60">
                  Chosen for where models differ in work people get paid for,
                  not where they demo well. Every prompt is public — there is no
                  hidden set.
                </Text>
              </div>
              {imageTasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </section>

            {draftTasks.length > 0 ? (
              <section className="mb-20">
                <div className="mb-4 flex flex-col justify-between gap-6 border-b border-edge/10 pb-10 sm:flex-row sm:items-end">
                  <div>
                    <Text className={LABEL_CLASS}>Season Two</Text>
                    <Heading
                      as="h2"
                      className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-surface sm:text-5xl"
                    >
                      Video, not yet running.
                    </Heading>
                  </div>
                  <Text className="max-w-md text-sm leading-6 text-surface/60">
                    Published now so the tasks are fixed in public before anyone
                    knows which model they will favour. The harness refuses to
                    draw a draft into a match.
                  </Text>
                </div>
                {draftTasks.map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
              </section>
            ) : null}

            <section className="border-t border-edge/10 pt-16">
              <Text className={LABEL_CLASS}>Contestants</Text>
              <Heading
                as="h2"
                className="mt-4 max-w-2xl text-3xl font-semibold tracking-[-0.04em] text-surface"
              >
                Genfeed is entered as a contestant, not as the scoreboard.
              </Heading>
              <Text className="mt-5 max-w-xl text-base leading-7 text-surface/65">
                One route runs through Genfeed's brief compiler; the rest are
                raw provider routes, including the same model the compiled route
                wraps. If the compile step makes a task worse, the ladder says
                so.
              </Text>
              <div className="mt-8 flex flex-wrap gap-3">
                {data.contestants.map((contestant) => (
                  <span
                    className="rounded-full border border-edge/15 px-4 py-2 text-sm text-surface/70"
                    key={contestant.id}
                  >
                    {contestant.label}
                    {contestant.isCompiled ? (
                      <span className="ml-2 text-xs uppercase tracking-[0.12em] text-surface/45">
                        Genfeed
                      </span>
                    ) : null}
                  </span>
                ))}
              </div>
            </section>
          </div>
        )}
      </PageLayout>
    </div>
  );
}
