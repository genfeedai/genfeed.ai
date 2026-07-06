'use client';

import { ButtonVariant, ComponentSize } from '@genfeedai/enums';
import type { ProjectState } from '@props/studio/clips.props';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Button } from '@ui/primitives/button';
import { HiOutlineFilm } from 'react-icons/hi2';
import type { ClipsApiService } from '../services/clips-api.service';
import ClipResultCard from './ClipResultCard';

interface ClipsProgressViewProps {
  clipsService: ClipsApiService;
  onReset: () => void;
  project: ProjectState;
  selectedCount: number;
}

export default function ClipsProgressView({
  clipsService,
  onReset,
  project,
  selectedCount,
}: ClipsProgressViewProps) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <HiOutlineFilm className="size-6 text-primary" />
          <h1 className="text-2xl font-semibold text-zinc-100">
            AI Clip Factory
          </h1>
        </div>
        <p className="mt-2 text-sm text-zinc-500">
          {project.status === 'completed'
            ? `Done -- ${project.clips.length} clips generated`
            : project.status === 'failed'
              ? 'Pipeline failed. Check logs for details.'
              : `Generating ${selectedCount} clips...`}
        </p>

        {project.status !== 'completed' && project.status !== 'failed' && (
          <div className="mt-4 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-primary transition-all duration-500" />
            </div>
            <span className="text-xs capitalize text-zinc-500">
              {project.status}
            </span>
          </div>
        )}
      </div>

      {project.clips.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {project.clips.map((clip) => (
            <ClipResultCard
              key={clip._id}
              clip={clip}
              clipsService={clipsService}
              projectId={project.projectId}
            />
          ))}
        </div>
      ) : (
        project.status !== 'completed' && (
          <div className="flex flex-col items-center justify-center rounded-xl bg-secondary py-20 shadow-border">
            <Spinner size={ComponentSize.LG} className="mb-4 text-primary" />
            <p className="text-sm text-zinc-500">
              Generating avatar clips for selected highlights…
            </p>
          </div>
        )
      )}

      <div className="mt-8">
        <Button
          variant={ButtonVariant.LINK}
          className="text-sm text-zinc-500 hover:text-zinc-300"
          onClick={onReset}
          label="Start new project"
        />
      </div>
    </div>
  );
}
