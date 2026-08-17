import { startCluster } from './fixtures/merobox';

/**
 * Boot the merobox cluster once for the whole run.
 *
 * Not a Playwright `webServer`: `merobox run` starts detached containers and
 * returns, so there is no foreground process for Playwright to own. The node
 * URLs are discovered from Docker afterwards (merobox auto-picks free ports)
 * and handed to the specs through the environment.
 */
export default async function globalSetup() {
  const nodes = await startCluster();
  process.env['MEROBOX_NODES'] = JSON.stringify(nodes);
  console.log(
    `[merobox] cluster ready: ${nodes.map((n) => `${n.name}=${n.url}`).join(', ')}`,
  );
}
