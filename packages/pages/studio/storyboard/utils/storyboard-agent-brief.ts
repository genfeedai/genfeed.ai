import type { StudioStoryboardProposal } from '@genfeedai/contracts/api-types/contracts';

const MAX_RUNTIME_BUDGET_SECONDS = 60;

export interface StoryboardAgentBriefLabels {
  shotLine: (shot: {
    description: string;
    index: number;
    seconds: number;
  }) => string;
  shotsHeading: string;
}

export interface StoryboardAgentBrief {
  brief: string;
  runtimeBudgetSeconds: number;
}

export function storyboardProposalRuntime(
  proposal: StudioStoryboardProposal,
): number {
  const total = proposal.shots.reduce(
    (sum, shot) => sum + shot.durationSeconds,
    0,
  );
  return Math.min(Math.max(total, 1), MAX_RUNTIME_BUDGET_SECONDS);
}

/**
 * The composer brief for an agent proposal: the story, then its shot plan,
 * so the plan drafter starts from the agent's shots. Shots that would push
 * the brief past `maxLength` are left off whole rather than cut mid-line.
 */
export function buildStoryboardAgentBrief(
  proposal: StudioStoryboardProposal,
  labels: StoryboardAgentBriefLabels,
  maxLength: number,
): StoryboardAgentBrief {
  let brief = proposal.brief.trim().slice(0, maxLength);
  const heading = `\n\n${labels.shotsHeading}`;
  if (brief.length + heading.length < maxLength) {
    const lines: string[] = [];
    let length = brief.length + heading.length;
    for (const [position, shot] of proposal.shots.entries()) {
      const line = `\n${labels.shotLine({
        description: shot.description.trim(),
        index: position + 1,
        seconds: shot.durationSeconds,
      })}`;
      if (length + line.length > maxLength) break;
      lines.push(line);
      length += line.length;
    }
    if (lines.length > 0) brief = `${brief}${heading}${lines.join('')}`;
  }

  return { brief, runtimeBudgetSeconds: storyboardProposalRuntime(proposal) };
}
