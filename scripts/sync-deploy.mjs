/**
 * Makes a hosting container match origin/main exactly, before the bot starts.
 *
 * Why this exists: the container's git history had drifted from GitHub, so
 * `git pull` stopped with "Need to specify how to reconcile divergent
 * branches" and every deploy silently kept running old code. Fixing that by
 * hand needs console access, which the panel does not always give you.
 *
 * A deploy target should be a copy of the repo, never a place with its own
 * history, so this resets rather than merges. Anything committed only on the
 * container is intentionally discarded -- that is the bug, not the data.
 *
 * SAFETY: this runs from `postinstall`, which also fires on a developer's
 * machine during a normal `npm install`. A hard reset there would destroy
 * uncommitted work, so it refuses to run anywhere except a hosting container,
 * detected by the /home/container path the panel uses. Set DEPLOY_SYNC=0 to
 * disable it entirely.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const CONTAINER_ROOT = '/home/container';

function run(args) {
  return execFileSync('git', args, { cwd: CONTAINER_ROOT, encoding: 'utf8', stdio: 'pipe' }).trim();
}

function main() {
  if (process.env.DEPLOY_SYNC === '0') return;

  // Only ever inside the hosting container, never on a dev machine.
  if (process.cwd() !== CONTAINER_ROOT || !existsSync(`${CONTAINER_ROOT}/.git`)) return;

  try {
    const branch = process.env.DEPLOY_BRANCH || 'main';
    const before = run(['rev-parse', '--short', 'HEAD']);

    run(['fetch', 'origin', branch]);
    const target = run(['rev-parse', '--short', `origin/${branch}`]);

    if (before === target) {
      console.log(`[deploy-sync] already at ${target}`);
      return;
    }

    // Report what is being thrown away, so a surprise is visible in the log
    // rather than silent.
    const localOnly = run(['log', '--oneline', `origin/${branch}..HEAD`]);
    if (localOnly) {
      console.log('[deploy-sync] discarding container-only commits:');
      for (const line of localOnly.split('\n')) console.log(`  ${line}`);
    }

    run(['reset', '--hard', `origin/${branch}`]);
    console.log(`[deploy-sync] ${before} -> ${target} (matched origin/${branch})`);
  } catch (e) {
    // Never block startup. A bot running slightly stale code is far better
    // than a bot that will not boot.
    const msg = (e?.stderr || e?.message || String(e)).toString().trim().split('\n')[0];
    console.error(`[deploy-sync] skipped: ${msg}`);
  }
}

main();
