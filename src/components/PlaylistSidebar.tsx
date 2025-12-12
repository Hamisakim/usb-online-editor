import { useMemo, useState } from 'react';
import type { PlaylistTreeNode, Track, PlaylistEntry } from '../types/rekordbox';

interface PlaylistSidebarProps {
  playlistTree: Map<number, PlaylistTreeNode>;
  playlistEntries: PlaylistEntry[];
  tracks: Map<number, Track>;
  selectedPlaylistId: number | null;
  onSelectPlaylist: (id: number | null) => void;
  onSelectAllTracks: () => void;
}

interface TreeNode {
  id: number;
  name: string;
  isFolder: boolean;
  children: TreeNode[];
  trackCount: number;
}

export function PlaylistSidebar({
  playlistTree,
  playlistEntries,
  tracks,
  selectedPlaylistId,
  onSelectPlaylist,
  onSelectAllTracks,
}: PlaylistSidebarProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());

  // Build track counts per playlist
  const playlistTrackCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const entry of playlistEntries) {
      counts.set(entry.playlistId, (counts.get(entry.playlistId) || 0) + 1);
    }
    return counts;
  }, [playlistEntries]);

  // Build tree structure
  const tree = useMemo(() => {
    const nodes = new Map<number, TreeNode>();
    const roots: TreeNode[] = [];

    // Create nodes
    for (const [id, node] of playlistTree) {
      nodes.set(id, {
        id,
        name: node.name,
        isFolder: node.isFolder,
        children: [],
        trackCount: playlistTrackCounts.get(id) || 0,
      });
    }

    // Build parent-child relationships
    for (const [id, node] of playlistTree) {
      const treeNode = nodes.get(id)!;
      if (node.parentId === 0) {
        roots.push(treeNode);
      } else {
        const parent = nodes.get(node.parentId);
        if (parent) {
          parent.children.push(treeNode);
        } else {
          roots.push(treeNode);
        }
      }
    }

    // Sort by sortOrder (we don't have it in TreeNode, so sort by name for now)
    const sortNodes = (nodes: TreeNode[]) => {
      nodes.sort((a, b) => a.name.localeCompare(b.name));
      nodes.forEach(n => sortNodes(n.children));
    };
    sortNodes(roots);

    return roots;
  }, [playlistTree, playlistTrackCounts]);

  const toggleFolder = (id: number) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isExpanded = expandedFolders.has(node.id);
    const isSelected = selectedPlaylistId === node.id;

    return (
      <div key={node.id}>
        <button
          onClick={() => {
            if (node.isFolder) {
              toggleFolder(node.id);
            } else {
              onSelectPlaylist(node.id);
            }
          }}
          className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-zinc-800 transition-colors ${
            isSelected ? 'bg-purple-900/50 text-purple-300' : 'text-zinc-300'
          }`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          {node.isFolder ? (
            <>
              <span className="text-zinc-500 w-4">
                {isExpanded ? '▼' : '▶'}
              </span>
              <FolderIcon />
              <span className="truncate flex-1">{node.name}</span>
            </>
          ) : (
            <>
              <span className="w-4" />
              <PlaylistIcon />
              <span className="truncate flex-1">{node.name}</span>
              <span className="text-zinc-500 text-sm">{node.trackCount}</span>
            </>
          )}
        </button>

        {node.isFolder && isExpanded && (
          <div>
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800">
        <h2 className="font-semibold text-white">Playlists</h2>
      </div>

      {/* All Tracks */}
      <button
        onClick={onSelectAllTracks}
        className={`w-full text-left px-4 py-2 flex items-center gap-2 hover:bg-zinc-800 transition-colors border-b border-zinc-800 ${
          selectedPlaylistId === null ? 'bg-purple-900/50 text-purple-300' : 'text-zinc-300'
        }`}
      >
        <MusicIcon />
        <span className="flex-1">All Tracks</span>
        <span className="text-zinc-500 text-sm">{tracks.size}</span>
      </button>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto">
        {tree.map(node => renderNode(node))}
      </div>

      {/* Stats */}
      <div className="p-4 border-t border-zinc-800 text-sm text-zinc-500">
        {playlistTree.size} playlists • {tracks.size} tracks
      </div>
    </div>
  );
}

function FolderIcon() {
  return (
    <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
    </svg>
  );
}

function PlaylistIcon() {
  return (
    <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
    </svg>
  );
}

function MusicIcon() {
  return (
    <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
    </svg>
  );
}
