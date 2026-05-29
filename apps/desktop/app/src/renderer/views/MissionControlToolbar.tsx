import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import type { ReactElement } from 'react';
import {
  HiOutlineCommandLine,
  HiOutlineFunnel,
  HiOutlineMagnifyingGlass,
} from 'react-icons/hi2';
import type { AgentLabStatus } from './MissionControlView';

type StatusOption = { label: string; value: AgentLabStatus | 'all' };

type MissionControlToolbarProps = {
  search: string;
  statusFilter: AgentLabStatus | 'all';
  statusOptions: StatusOption[];
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: AgentLabStatus | 'all') => void;
  onReset: () => void;
  onOpenEmptySurface: () => void;
};

export function MissionControlToolbar({
  search,
  statusFilter,
  statusOptions,
  onSearchChange,
  onStatusFilterChange,
  onReset,
  onOpenEmptySurface,
}: MissionControlToolbarProps): ReactElement {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
          <label className="relative flex-1" htmlFor="mission-control-search">
            <HiOutlineMagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/35" />
            <Input
              id="mission-control-search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              className="w-full rounded-xl border border-white/[0.08] bg-background px-10 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-foreground/30 focus:border-primary/40"
              placeholder="Search assets, channels, owners, or status"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {statusOptions.map((option) => (
              <Button
                key={option.value}
                variant={
                  statusFilter === option.value
                    ? ButtonVariant.DEFAULT
                    : ButtonVariant.SECONDARY
                }
                onClick={() => onStatusFilterChange(option.value)}
              >
                <span className="inline-flex items-center gap-2">
                  <HiOutlineFunnel className="size-4" />
                  {option.label}
                </span>
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant={ButtonVariant.SECONDARY} onClick={onReset}>
            Reset Filters
          </Button>
          <Button
            variant={ButtonVariant.SECONDARY}
            onClick={onOpenEmptySurface}
          >
            <span className="inline-flex items-center gap-2">
              <HiOutlineCommandLine className="size-4" />
              Open Empty Surface
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}
