import { setTimeout as delay } from 'node:timers/promises';

const CLA_CONTEXT = 'license/cla';

export async function recoverClaStatuses(
  github,
  {
    owner,
    repo,
    numbers,
    attempts = 6,
    intervalMs = 30000,
    wait = delay,
    request = fetch,
    log = () => {},
  },
) {
  if (
    !/^[\w.-]+$/.test(owner) ||
    !/^[\w.-]+$/.test(repo) ||
    !Array.isArray(numbers) ||
    numbers.some((number) => !Number.isSafeInteger(number) || number < 1)
  ) {
    throw new Error('Invalid repository or pull request number.');
  }
  const uniqueNumbers = [...new Set(numbers)];
  const recoverOne = async (number) => {
    try {
      const { data: pull } = await github.rest.pulls.get({
        owner,
        repo,
        pull_number: number,
      });
      if (pull.state !== 'open') {
        return { number, outcome: 'closed' };
      }
      const sha = pull.head.sha;
      const readStatus = async () => {
        const statuses = await github.paginate(
          github.rest.repos.listCommitStatusesForRef,
          {
            owner,
            repo,
            ref: sha,
            per_page: 100,
          },
        );
        return statuses.find((status) => status.context === CLA_CONTEXT);
      };
      let status = await readStatus();
      let isSuperseded = false;
      for (let attempt = 0; !status && attempt < attempts; attempt++) {
        const url = new URL(`https://cla-assistant.io/check/${owner}/${repo}`);
        url.searchParams.set('pullRequest', String(number));
        try {
          const response = await request(url, {
            redirect: 'manual',
            signal: AbortSignal.timeout(30000),
          });
          // A 302 only acknowledges the request. The integration must publish
          // its own verdict on this exact commit before recovery succeeds.
          log(
            `#${number}: CLA recheck attempt ${attempt + 1}, HTTP ${response.status}`,
          );
        } catch (error) {
          log(`#${number}: CLA recheck transport failed: ${error.message}`);
        }
        await wait(intervalMs);
        const { data: current } = await github.rest.pulls.get({
          owner,
          repo,
          pull_number: number,
        });
        if (current.head.sha !== sha) {
          isSuperseded = true;
          break;
        }
        status = await readStatus();
      }
      if (isSuperseded) {
        return { number, sha, outcome: 'superseded' };
      } else if (status) {
        log(`#${number}: ${CLA_CONTEXT} reported ${status.state} on ${sha}`);
        return { number, sha, outcome: 'reported', state: status.state };
      } else {
        return {
          error: `#${number}: ${CLA_CONTEXT} is still missing on ${sha}`,
        };
      }
    } catch (error) {
      return { error: `#${number}: ${error.message}` };
    }
  };
  const outcomes = [];
  for (let offset = 0; offset < uniqueNumbers.length; offset += 3) {
    outcomes.push(
      ...(await Promise.all(
        uniqueNumbers.slice(offset, offset + 3).map(recoverOne),
      )),
    );
  }
  const failures = outcomes
    .filter((outcome) => outcome.error)
    .map((outcome) => outcome.error);
  if (failures.length) throw new Error(failures.join('\n'));
  return outcomes;
}
