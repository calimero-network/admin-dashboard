/**
 * Boot a throwaway merod node for the live e2e suite.
 *
 * Launched by playwright.live.config.ts as a `webServer`, so Playwright owns
 * readiness (it polls /admin-api/health) and teardown. Runs in the foreground
 * and forwards merod's output, which is what makes a failed boot visible in the
 * CI log instead of a bare readiness timeout.
 */
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const rootDir = path.resolve(import.meta.dirname, '..');
const merod = path.join(rootDir, '.merod', 'merod');

export const NODE_NAME = process.env['LIVE_NODE_NAME'] ?? 'e2e';
export const SERVER_PORT = Number(process.env['LIVE_SERVER_PORT'] ?? '3628');
export const SWARM_PORT = Number(process.env['LIVE_SWARM_PORT'] ?? '3428');
export const ADMIN_USER = process.env['LIVE_ADMIN_USER'] ?? 'e2eadmin';
export const ADMIN_PASSWORD =
  process.env['LIVE_ADMIN_PASSWORD'] ?? 'e2e-admin-password';

if (!fs.existsSync(merod)) {
  console.error(`merod not found at ${merod}. Run: pnpm merod:prepare`);
  process.exit(1);
}

// A fresh home per run: these tests create and delete namespaces, contexts and
// applications, and asserting on counts is only meaningful from empty. Reusing a
// home would also carry over an admin account whose password may differ.
const home =
  process.env['LIVE_NODE_HOME'] ??
  fs.mkdtempSync(path.join(os.tmpdir(), 'mero-e2e-'));

console.log(`[live-node] home=${home} node=${NODE_NAME} port=${SERVER_PORT}`);

// `--auth-mode embedded` is required, and is NOT the default: merod defaults to
// `proxy`, where authentication is fronted by a separate mero-auth service and
// the node itself serves no /auth/* routes at all — POST /auth/token 404s. The
// embedded mode is what a self-contained node (and this dashboard) expects.
//
// Since core rc.17 the admin account is minted AT INIT — a node initialised
// without credentials cannot be logged into at all. The password goes through
// the environment, never argv: merod deliberately has no --admin-password flag
// because that would leak the password into process listings.
try {
  execFileSync(
    merod,
    [
      '--home',
      home,
      '--node',
      NODE_NAME,
      'init',
      '--server-port',
      String(SERVER_PORT),
      '--swarm-port',
      String(SWARM_PORT),
      '--auth-mode',
      'embedded',
      '--admin-user',
      ADMIN_USER,
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, MERO_AUTH_ADMIN_PASSWORD: ADMIN_PASSWORD },
    },
  );
} catch (err) {
  console.error('[live-node] init failed:', err.message ?? err);
  process.exit(1);
}

const child = spawn(merod, ['--home', home, '--node', NODE_NAME, 'run'], {
  stdio: 'inherit',
  env: { ...process.env },
});

// `child.killed` is NOT "the child has exited" — Node sets it as soon as a
// signal is successfully SENT. Using it to gate the SIGKILL escalation meant
// the escalation could never fire (SIGTERM had already set it), so a merod
// that ignored SIGTERM was left running while this process exited: an orphan
// holding the server and swarm ports against the next run.
let exited = false;

const shutdown = (signal) => {
  // merod stops on SIGTERM; there is no HTTP route for it.
  if (!exited) child.kill('SIGTERM');
  setTimeout(() => {
    if (!exited) child.kill('SIGKILL');
    process.exit(signal === 'SIGINT' ? 130 : 143);
  }, 5000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Without an 'error' listener a failed spawn (EACCES, or the binary vanishing
// between the existsSync check and here) is an unhandled 'error' event, which
// Node turns into an uncaught exception — a stack trace instead of this
// script's own diagnostics.
child.on('error', (err) => {
  console.error('[live-node] failed to start merod:', err.message ?? err);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  exited = true;
  console.log(`[live-node] merod exited code=${code} signal=${signal}`);
  process.exit(code ?? 0);
});
