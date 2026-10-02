// Imported only by the trusted master controller; never execute PR code here.
export const REPOSITORY = {
  owner: 'genfeedai',
  repo: 'genfeed.ai',
  id: 1201383909,
};
export const OWNER_ID = 1998775;
export const REQUIRED = [
  { context: 'Tests Gate', integration_id: 15368 },
  { context: 'PR Title', integration_id: 15368 },
  { context: 'Socket Security: Project Report', integration_id: 156372 },
  { context: 'license/cla' },
];

export function verifyRuleset(rule) {
  const required = rule?.rules?.find(
    (entry) => entry.type === 'required_status_checks',
  );
  const review = rule?.rules?.find(
    (entry) => entry.type === 'pull_request',
  )?.parameters;
  const checks = required?.parameters?.required_status_checks ?? [];
  return (
    rule?.target === 'branch' &&
    rule.enforcement === 'active' &&
    Array.isArray(rule.bypass_actors) &&
    rule.bypass_actors.length === 0 &&
    rule.conditions?.ref_name?.exclude?.length === 0 &&
    rule.conditions?.ref_name?.include?.length === 1 &&
    rule.conditions.ref_name.include[0] === 'refs/heads/master' &&
    required?.parameters?.strict_required_status_checks_policy === true &&
    required?.parameters?.do_not_enforce_on_create === false &&
    REQUIRED.every((wanted) =>
      checks.some(
        (actual) =>
          actual.context === wanted.context &&
          (actual.integration_id ?? undefined) === wanted.integration_id,
      ),
    ) &&
    review?.require_code_owner_review === true &&
    review?.required_review_thread_resolution === true &&
    review?.require_extra_approval_for_unattributed_changes === true &&
    rule.rules.some((entry) => entry.type === 'required_linear_history')
  );
}

export function admission(pr, { requests, threads, reviews }) {
  if (
    pr.state !== 'open' ||
    pr.draft ||
    pr.user?.id !== OWNER_ID ||
    pr.head?.repo?.id !== REPOSITORY.id ||
    pr.base?.repo?.id !== REPOSITORY.id ||
    pr.base.ref !== 'master'
  )
    return 'identity or state';
  if (pr.labels.some((label) => label.name === 'hold-merge'))
    return 'hold-merge';
  if (requests.length || threads.some((thread) => !thread.isResolved))
    return 'outstanding review';
  if (['CHANGES_REQUESTED', 'REVIEW_REQUIRED'].includes(pr.reviewDecision))
    return 'review decision';
  const decisive = new Map();
  for (const review of reviews) {
    if (review.state === 'PENDING') return 'pending review';
    if (['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state))
      decisive.set(review.author?.login ?? review.id, review.state);
  }
  if ([...decisive.values()].includes('CHANGES_REQUESTED'))
    return 'changes requested';
  return null;
}

export function checksReady(checks, statuses, runs, expected) {
  // REST check runs are newest first; use IDs to invalidate older green reruns.
  const latest = new Map();
  for (const check of checks) {
    const key = `${check.app?.id}:${check.name}`;
    if (!latest.has(key) || latest.get(key).id < check.id)
      latest.set(key, check);
  }
  const latestStatuses = new Map();
  for (const status of statuses) {
    if (
      !latestStatuses.has(status.context) ||
      latestStatuses.get(status.context).id < status.id
    )
      latestStatuses.set(status.context, status);
  }
  const latestRuns = new Map();
  for (const run of runs) {
    if (
      !latestRuns.has(run.workflow_id) ||
      latestRuns.get(run.workflow_id).id < run.id
    )
      latestRuns.set(run.workflow_id, run);
  }
  const workflowFor = (check) =>
    runs.find((run) => run.check_suite_id === check.check_suite?.id);
  for (const required of REQUIRED) {
    if (required.context === 'license/cla') {
      const status = latestStatuses.get(required.context);
      if (status?.state !== 'success' || status.creator?.id !== OWNER_ID)
        return false;
    } else {
      const check = latest.get(
        `${required.integration_id}:${required.context}`,
      );
      if (check?.status !== 'completed' || check.conclusion !== 'success')
        return false;
      if (required.integration_id === 15368) {
        const run = workflowFor(check);
        const allowed =
          required.context === 'PR Title'
            ? ['.github/workflows/pr-title.yml']
            : ['.github/workflows/ci.yml', '.github/workflows/pr-heavy-ci.yml'];
        if (
          !run ||
          run.head_sha !== expected?.head ||
          !run.pull_requests?.some((pr) => pr.number === expected?.number) ||
          !(required.context === 'PR Title'
            ? run.event === 'pull_request_target'
            : run.event === 'pull_request') ||
          !allowed.includes(run.path?.split('@')[0]) ||
          latestRuns.get(run.workflow_id)?.id !== run.id ||
          run.status !== 'completed' ||
          run.conclusion !== 'success'
        )
          return false;
      } else if (check.app?.slug !== 'socket-security') return false;
    }
    // GitHub requires both namespaces when a status and check share a name.
    const status = latestStatuses.get(required.context);
    if (status && status.state !== 'success') return false;
    if (
      [...latest.values()].some(
        (check) =>
          check.name === required.context &&
          (check.status !== 'completed' || check.conclusion !== 'success'),
      )
    )
      return false;
  }
  if (
    [...latest.values()].some(
      (check) =>
        check.status !== 'completed' ||
        !['success', 'neutral', 'skipped'].includes(check.conclusion),
    )
  )
    return false;
  if ([...latestStatuses.values()].some((status) => status.state !== 'success'))
    return false;
  return ![...latestRuns.values()].some(
    (run) =>
      run.status !== 'completed' ||
      !['success', 'neutral', 'skipped'].includes(run.conclusion),
  );
}

async function connection(github, number, field, selection) {
  const nodes = [];
  let cursor = null;
  do {
    const result = await github.graphql(
      `query($number:Int!,$cursor:String){repository(owner:"genfeedai",name:"genfeed.ai"){pullRequest(number:$number){${field}(first:100,after:$cursor){nodes{${selection}}pageInfo{hasNextPage endCursor}}}}}`,
      { number, cursor },
    );
    const page = result.repository.pullRequest[field];
    nodes.push(...page.nodes);
    if (
      page.pageInfo.hasNextPage &&
      (!page.pageInfo.endCursor || page.pageInfo.endCursor === cursor)
    ) {
      throw new Error(`Incomplete ${field} pagination`);
    }
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return nodes;
}

async function snapshot(github, number) {
  const args = { owner: REPOSITORY.owner, repo: REPOSITORY.repo };
  const { data: pr } = await github.rest.pulls.get({
    ...args,
    pull_number: number,
  });
  const [requests, threads, reviews, decision, checks, statuses, runs, base] =
    await Promise.all([
      connection(
        github,
        number,
        'reviewRequests',
        'requestedReviewer{__typename}',
      ),
      connection(github, number, 'reviewThreads', 'isResolved'),
      connection(github, number, 'reviews', 'id state author{login}'),
      github.graphql(
        'query($number:Int!){repository(owner:"genfeedai",name:"genfeed.ai"){pullRequest(number:$number){reviewDecision}}}',
        { number },
      ),
      github.paginate(github.rest.checks.listForRef, {
        ...args,
        ref: pr.head.sha,
        filter: 'all',
        per_page: 100,
      }),
      github.paginate(github.rest.repos.listCommitStatusesForRef, {
        ...args,
        ref: pr.head.sha,
        per_page: 100,
      }),
      github.paginate(github.rest.actions.listWorkflowRunsForRepo, {
        ...args,
        head_sha: pr.head.sha,
        per_page: 100,
      }),
      github.rest.repos.getBranch({ ...args, branch: 'master' }),
    ]);
  pr.reviewDecision = decision.repository.pullRequest.reviewDecision;
  const compare = await github.rest.repos.compareCommits({
    ...args,
    base: base.data.commit.sha,
    head: pr.head.sha,
  });
  return {
    pr,
    base: base.data.commit.sha,
    reviews: { requests, threads, reviews },
    checks,
    statuses,
    runs,
    current: ['ahead', 'identical'].includes(compare.data.status),
  };
}

export async function reconcile({
  github,
  mode,
  rulesetId,
  log = console.log,
}) {
  if (!mode || mode === 'off') return log('Owner merging is off');
  if (mode !== 'strict')
    throw new Error(
      'Native queue requires authentic group checks; only strict mode is available',
    );
  if (!/^\d+$/.test(String(rulesetId)))
    throw new Error('Missing strict ruleset ID');
  const args = { owner: REPOSITORY.owner, repo: REPOSITORY.repo };
  const verify = async () => {
    const { data: rule } = await github.rest.repos.getRepoRuleset({
      ...args,
      ruleset_id: Number(rulesetId),
    });
    if (!verifyRuleset(rule))
      throw new Error('Strict no-bypass master ruleset is not verified');
  };
  await verify();
  const pulls = await github.paginate(github.rest.pulls.list, {
    ...args,
    state: 'open',
    base: 'master',
    sort: 'created',
    direction: 'asc',
    per_page: 100,
  });
  const snapshots = [];
  for (const candidate of pulls) {
    if (candidate.user?.id === OWNER_ID && !candidate.draft)
      snapshots.push(await snapshot(github, candidate.number));
  }
  // Serializing requests alone still refreshes every waiting PR. Hold branch
  // updates while a current-base owner PR occupies the active CI lane.
  const active = snapshots.some(
    (value) =>
      value.current &&
      !admission(value.pr, value.reviews) &&
      value.runs.some(
        (run) =>
          [
            '.github/workflows/ci.yml',
            '.github/workflows/pr-heavy-ci.yml',
          ].includes(run.path?.split('@')[0]) && run.status !== 'completed',
      ),
  );
  const ready = (value) =>
    checksReady(value.checks, value.statuses, value.runs, {
      head: value.pr.head.sha,
      number: value.pr.number,
    });
  for (const first of snapshots) {
    const candidate = first.pr;
    const reason = admission(first.pr, first.reviews);
    if (reason || !ready(first)) {
      log(`#${candidate.number}: waiting (${reason ?? 'checks'})`);
      continue;
    }
    const fresh = await snapshot(github, candidate.number);
    if (
      first.pr.head.sha !== fresh.pr.head.sha ||
      first.base !== fresh.base ||
      admission(fresh.pr, fresh.reviews) ||
      !ready(fresh)
    )
      continue;
    await verify();
    if (!fresh.current) {
      if (active) {
        log(`#${candidate.number}: waiting for active current-base CI`);
        continue;
      }
      await github.rest.pulls.updateBranch({
        ...args,
        pull_number: candidate.number,
        expected_head_sha: fresh.pr.head.sha,
      });
      return log(
        `#${candidate.number}: updated with master; waiting for fresh CI`,
      );
    }
    if (fresh.pr.mergeable !== true || fresh.pr.mergeable_state !== 'clean')
      continue;
    const result = await github.rest.pulls.merge({
      ...args,
      pull_number: candidate.number,
      sha: fresh.pr.head.sha,
      merge_method: 'squash',
    });
    if (result.data?.merged !== true || !result.data.sha)
      throw new Error(`Merge not confirmed for #${candidate.number}`);
    return log(
      `#${candidate.number}: merged ${fresh.pr.head.sha} as ${result.data.sha}`,
    );
  }
  log('No eligible green owner PR');
}
