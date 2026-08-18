import { useEffect, useState } from 'react';
import { getNodeIdentity, type NodeIdentity } from '../../api/namespaceApi';

/**
 * Who this node is, fetched once and shared by every caller.
 *
 * Three places need it and they are on screen together: the members table
 * marking a row "you", and both detail headers choosing between Delete (admin)
 * and Leave (everyone else). Until core 0.11.0-rc.23 all three read
 * `selfIdentity` off the member-list response and no extra request existed;
 * that field is gone (#3522, and the list now carries `members` and nothing
 * else), so the answer has to come from `GET /admin-api/identity`.
 *
 * There is deliberately no cache key. The route takes no namespace and the
 * answer does not vary by one — one root key is one account everywhere on a
 * node — which is the same fact that got the per-namespace route deleted. So a
 * single in-flight promise is the whole cache.
 *
 * A miss is a NORMAL state, not an error: the route 404s on a node that has
 * taken part in nothing yet, because it holds neither a device nor an account
 * root. The UI just cannot mark anyone as "you", and must not toast about it.
 */
let pending: Promise<NodeIdentity | null> | null = null;

function load(): Promise<NodeIdentity | null> {
  pending ??= getNodeIdentity().catch(() => {
    // Don't let a transient failure become permanent. The rejection handler
    // runs after the assignment above, so clearing it here makes the next
    // mount retry rather than believing forever that this node has no account.
    pending = null;
    return null;
  });
  return pending;
}

/** Test-only: drop the shared promise so the next mount refetches. */
export function resetNodeIdentity(): void {
  pending = null;
}

export function useNodeIdentity(): NodeIdentity | null {
  const [identity, setIdentity] = useState<NodeIdentity | null>(null);

  useEffect(() => {
    let live = true;
    void load().then((result) => {
      if (live) setIdentity(result);
    });
    return () => {
      live = false;
    };
  }, []);

  return identity;
}
