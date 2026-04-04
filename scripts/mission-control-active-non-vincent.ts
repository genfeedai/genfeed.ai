#!/usr/bin/env bun

import { $ } from 'bun';

type ProjectItem = {
  assignees?: string[];
  owner?: string;
  status?: string;
  title?: string;
  content?: {
    number?: number;
    repository?: string;
    type?: string;
    url?: string;
  };
};

const RESERVED_ASSIGNEE = 'VincentShipsIt';

async function main(): Promise<void> {
  const result =
    await $`gh project item-list 11 --owner genfeedai --limit 200 --format json`.text();
  const parsed = JSON.parse(result) as { items?: ProjectItem[] };
  const items = parsed.items ?? [];

  const active = items.filter((item) => {
    const content = item.content;
    return (
      content?.repository === 'genfeedai/cloud' &&
      content.type === 'Issue' &&
      ['Todo', 'In Progress', 'Backlog'].includes(item.status ?? '')
    );
  });

  const reserved = active.filter((item) =>
    (item.assignees ?? []).includes(RESERVED_ASSIGNEE),
  );
  const eligible = active.filter(
    (item) => !(item.assignees ?? []).includes(RESERVED_ASSIGNEE),
  );

  console.log('Reserved (excluded from agent execution):');
  for (const item of reserved) {
    console.log(
      `- #${item.content?.number} ${item.title} [status=${item.status ?? 'unknown'} assignee=${(item.assignees ?? []).join(',') || 'none'}]`,
    );
  }

  console.log('\nEligible active items:');
  for (const item of eligible) {
    console.log(
      `- #${item.content?.number} ${item.title} [status=${item.status ?? 'unknown'} owner=${item.owner ?? 'none'} assignee=${(item.assignees ?? []).join(',') || 'none'}]`,
    );
  }
}

await main();
