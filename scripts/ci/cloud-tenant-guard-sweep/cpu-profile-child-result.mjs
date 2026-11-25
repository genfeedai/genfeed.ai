/**
 * Waits for the one IPC message a forked fixture child sends back, and fails
 * with the child's exit status and its complete stderr when it ends first.
 *
 * The failure is built from the `close` event, not `exit`: a child can exit
 * before its stderr stream has delivered everything, and `close` fires only
 * after the streams have closed (#10942).
 */
export function awaitChildResult(child, { watchdogMs }) {
  let stderr = '';
  child.stderr?.on('data', (chunk) => {
    stderr += chunk;
  });
  let watchdog;
  const settled = new Promise((resolve, reject) => {
    // biome-ignore lint/style/noRestrictedGlobals: wall-clock guard on a real child process; fake timers cannot stop a child stuck in a busy loop
    watchdog = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Busy-main inspector proof exceeded child watchdog'));
    }, watchdogMs);
    child.once('message', resolve);
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code !== 0)
        reject(
          new Error(
            `Busy-main inspector child failed (exit ${code ?? signal}): ${stderr}`,
          ),
        );
    });
  });
  return settled.finally(() => clearTimeout(watchdog));
}
