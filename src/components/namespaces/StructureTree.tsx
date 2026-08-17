import React, { useState } from 'react';
import {
  ChevronRightIcon,
  CubeIcon,
  FolderIcon,
  Square3Stack3DIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import type { GroupContextEntry } from '../../api/namespaceApi';
import type { NamespaceTree, TreeSubgroup } from './useNamespaceTree';
import { CopyBtn, RenameField, truncate } from './shared';

/**
 * The namespace's folder structure: contexts (running app instances) and
 * subgroups (nested groups that hold their own contexts), all the way down.
 *
 * This is the view that replaced the separate Contexts tab — a context is
 * never node-global, it belongs to exactly one group, so it is shown where it
 * lives.
 */
export function StructureTree({
  namespaceId,
  namespaceName,
  tree,
  onOpenGroup,
  onDeleteGroup,
  onDeleteContext,
  onRenameContext,
}: {
  namespaceId: string;
  namespaceName: string;
  tree: NamespaceTree;
  onOpenGroup: (groupId: string) => void;
  onDeleteGroup: (groupId: string, name: string) => void;
  onDeleteContext: (contextId: string, name: string) => void;
  /** `parentGroupId` is required: context metadata is addressed via its group. */
  onRenameContext: (
    parentGroupId: string,
    contextId: string,
    name: string,
  ) => void;
}) {
  const rootKey = `ns:${namespaceId}`;
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set([rootKey]),
  );

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderContext = (
    ctx: GroupContextEntry,
    parentGroupId: string,
    indent: number,
  ) => (
    <div
      key={`ctx-${ctx.contextId}`}
      className="ns-tree-row"
      style={{ paddingLeft: `${8 + indent * 20}px` }}
      data-testid="ns-tree-context"
    >
      <span className="ns-tree-toggle-spacer" />
      <CubeIcon className="ns-tree-icon" />
      <span className="ns-tree-label">
        {ctx.name ? (
          <>
            <span className="ns-tree-name">{ctx.name}</span>
            <span className="ns-tree-id mono">{truncate(ctx.contextId)}</span>
          </>
        ) : (
          <span className="ns-tree-name mono">{truncate(ctx.contextId)}</span>
        )}
      </span>
      <RenameField
        value={ctx.name}
        placeholder="Context name"
        onSave={(name) => onRenameContext(parentGroupId, ctx.contextId, name)}
      />
      <CopyBtn value={ctx.contextId} />
      <button
        className="ns-tree-danger"
        title="Delete context"
        aria-label={`Delete context ${ctx.name ?? ctx.contextId}`}
        onClick={() =>
          onDeleteContext(ctx.contextId, ctx.name ?? truncate(ctx.contextId))
        }
      >
        <TrashIcon style={{ width: 13, height: 13 }} />
      </button>
    </div>
  );

  const renderSubgroup = (sg: TreeSubgroup, indent: number) => {
    const isOpen = expanded.has(sg.groupId);
    const childCount = sg.contexts.length + sg.subgroups.length;
    return (
      <div key={`sg-${sg.groupId}`}>
        <div
          className="ns-tree-row"
          style={{ paddingLeft: `${8 + indent * 20}px` }}
          data-testid="ns-tree-subgroup"
        >
          <button
            className="ns-tree-toggle"
            onClick={() => toggle(sg.groupId)}
            disabled={childCount === 0}
            title={isOpen ? 'Collapse' : 'Expand'}
            aria-label={isOpen ? 'Collapse' : 'Expand'}
          >
            {childCount > 0 && (
              <ChevronRightIcon
                className={`ns-tree-chevron${isOpen ? ' ns-tree-chevron-open' : ''}`}
              />
            )}
          </button>
          <FolderIcon className="ns-tree-icon" />
          <button
            className="ns-tree-label ns-tree-link"
            onClick={() => onOpenGroup(sg.groupId)}
            title="Open subgroup"
          >
            {sg.name ? (
              <>
                <span className="ns-tree-name">{sg.name}</span>
                <span className="ns-tree-id mono">{truncate(sg.groupId)}</span>
              </>
            ) : (
              <span className="ns-tree-name mono">{truncate(sg.groupId)}</span>
            )}
          </button>
          <span className="ns-tree-count" title="Contexts + nested subgroups">
            {childCount}
          </span>
          <CopyBtn value={sg.groupId} />
          <button
            className="ns-tree-danger"
            title="Delete subgroup"
            aria-label={`Delete subgroup ${sg.name ?? sg.groupId}`}
            onClick={() =>
              onDeleteGroup(sg.groupId, sg.name ?? truncate(sg.groupId))
            }
          >
            <TrashIcon style={{ width: 13, height: 13 }} />
          </button>
        </div>
        {isOpen && (
          <>
            {childCount === 0 ? (
              <div
                className="ns-tree-empty"
                style={{ paddingLeft: `${8 + (indent + 1) * 20}px` }}
              >
                Empty subgroup
              </div>
            ) : (
              <>
                {sg.contexts.map((c) =>
                  renderContext(c, sg.groupId, indent + 1),
                )}
                {sg.subgroups.map((child) => renderSubgroup(child, indent + 1))}
              </>
            )}
          </>
        )}
      </div>
    );
  };

  const rootOpen = expanded.has(rootKey);
  const rootChildren = tree.rootContexts.length + tree.subgroups.length;

  return (
    <div className="ns-tree">
      <div className="ns-tree-row" style={{ paddingLeft: 8 }}>
        <button
          className="ns-tree-toggle"
          onClick={() => toggle(rootKey)}
          disabled={rootChildren === 0}
          title={rootOpen ? 'Collapse' : 'Expand'}
          aria-label={rootOpen ? 'Collapse' : 'Expand'}
        >
          {rootChildren > 0 && (
            <ChevronRightIcon
              className={`ns-tree-chevron${rootOpen ? ' ns-tree-chevron-open' : ''}`}
            />
          )}
        </button>
        <Square3Stack3DIcon className="ns-tree-icon ns-tree-icon-root" />
        <span className="ns-tree-label">
          <span className="ns-tree-name">{namespaceName}</span>
        </span>
        <span className="ns-tree-count">{rootChildren}</span>
      </div>
      {rootOpen && (
        <>
          {tree.rootContexts.map((c) => renderContext(c, namespaceId, 1))}
          {tree.subgroups.map((sg) => renderSubgroup(sg, 1))}
        </>
      )}
    </div>
  );
}
