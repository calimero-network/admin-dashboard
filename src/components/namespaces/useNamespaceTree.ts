import { useEffect, useState } from 'react';
import {
  listGroupContexts,
  listNamespaceGroups,
  listSubgroups,
  type GroupContextEntry,
} from '../../api/namespaceApi';

/**
 * The whole shape of a namespace: root-level contexts plus subgroups, each of
 * which owns its own contexts and (recursively) nested subgroups.
 *
 * The node only answers one level at a time, so the tree is walked here. This
 * is what makes the "Contexts" and "Subgroups" counts mean the whole
 * namespace rather than just its root — the single-level counts on the
 * namespace row omit everything nested.
 */
export interface TreeSubgroup {
  groupId: string;
  name?: string | undefined;
  contexts: GroupContextEntry[];
  subgroups: TreeSubgroup[];
}

export interface NamespaceTree {
  rootContexts: GroupContextEntry[];
  subgroups: TreeSubgroup[];
}

/** Guard against a pathological/cyclic group graph blowing the stack. */
const MAX_TREE_DEPTH = 12;

export function countTreeContexts(tree: NamespaceTree): number {
  let n = tree.rootContexts.length;
  const walk = (sg: TreeSubgroup) => {
    n += sg.contexts.length;
    sg.subgroups.forEach(walk);
  };
  tree.subgroups.forEach(walk);
  return n;
}

export function countTreeSubgroups(tree: NamespaceTree): number {
  let n = 0;
  const walk = (sg: TreeSubgroup) => {
    n += 1;
    sg.subgroups.forEach(walk);
  };
  tree.subgroups.forEach(walk);
  return n;
}

export interface NamespaceTreeState {
  tree: NamespaceTree | null;
  loading: boolean;
  /** A sub-fetch failed: the branches and counts shown may be incomplete. */
  partial: boolean;
}

export function useNamespaceTree(
  namespaceId: string | null,
  version: number,
): NamespaceTreeState {
  const [state, setState] = useState<NamespaceTreeState>({
    tree: null,
    loading: false,
    partial: false,
  });

  useEffect(() => {
    if (!namespaceId) {
      setState({ tree: null, loading: false, partial: false });
      return;
    }
    let cancelled = false;
    // Any sub-fetch failure flips this, so the UI can say the tree is partial
    // instead of silently rendering an empty subtree.
    let failed = false;

    const onErr =
      <T>(empty: T) =>
      (): T => {
        failed = true;
        return empty;
      };

    const buildSubgroup = async (
      groupId: string,
      name: string | undefined,
      depth: number,
    ): Promise<TreeSubgroup> => {
      // Stop descending once this run is superseded — no point issuing a burst
      // of requests for a tree that will be discarded.
      if (cancelled) return { groupId, name, contexts: [], subgroups: [] };
      const [contexts, subs] = await Promise.all([
        listGroupContexts(groupId).catch(onErr<GroupContextEntry[]>([])),
        depth < MAX_TREE_DEPTH
          ? listSubgroups(groupId).catch(onErr([]))
          : Promise.resolve([]),
      ]);
      if (cancelled) return { groupId, name, contexts: [], subgroups: [] };
      const subgroups = await Promise.all(
        subs.map((s) => buildSubgroup(s.groupId, s.name, depth + 1)),
      );
      return { groupId, name, contexts, subgroups };
    };

    setState((prev) => ({ ...prev, loading: true, partial: false }));
    (async () => {
      const [rootContexts, nsSubs] = await Promise.all([
        listGroupContexts(namespaceId).catch(onErr<GroupContextEntry[]>([])),
        listNamespaceGroups(namespaceId).catch(onErr([])),
      ]);
      const subgroups = await Promise.all(
        nsSubs.map((s) => buildSubgroup(s.groupId, s.name, 1)),
      );
      return { rootContexts, subgroups };
    })()
      .then((tree) => {
        if (cancelled) return;
        setState({ tree, loading: false, partial: failed });
      })
      .catch(() => {
        // Total failure: keep whatever tree is on screen rather than blanking
        // it to a misleading "empty namespace", and flag it as partial.
        if (cancelled) return;
        setState((prev) => ({ ...prev, loading: false, partial: true }));
      });

    return () => {
      cancelled = true;
    };
  }, [namespaceId, version]);

  return state;
}
