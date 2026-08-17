import { stopCluster } from './fixtures/merobox';

/**
 * Always stop the cluster. These containers hold node state, and a leftover
 * one would be silently reused by the next run — which is exactly how a
 * "passing" suite starts depending on data an earlier run created.
 */
export default async function globalTeardown() {
  if (process.env['MEROBOX_KEEP']) {
    console.log('[merobox] MEROBOX_KEEP set — leaving the cluster running');
    return;
  }
  await stopCluster();
}
