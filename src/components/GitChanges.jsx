import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Modal, Dropdown, message } from 'antd';
import { t } from '../i18n';
import { apiUrl } from '../utils/apiUrl';
import { getFileIcon } from '../utils/fileIcons';
import { fetchAllRepos } from '../utils/gitApi';
import { buildGitTree } from '../utils/gitTreeBuilder';
import styles from './GitChanges.module.css';

const STATUS_COLORS = {
  'M': '#e2c08d',
  'A': '#73c991',
  'D': '#f14c4c',
  'R': '#73c991',
  'C': '#73c991',
  'U': '#e2c08d',
  '?': '#73c991',
  '??': '#73c991',
};

const STATUS_LABELS = {
  '??': 'U',
};

function TreeDir({ name, node, depth, repoPath, onFileClick, onOpenFile, onRestore, selectedFile, selectedRepo, commitHash, selectedCommitHash }) {
  const dirNames = Object.keys(node.dirs).sort();
  const files = [...node.files].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      {name && (
        <div className={styles.dirItem} style={{ paddingLeft: 8 + depth * 16 }}>
          <span className={styles.dirArrow}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={styles.rotated90}>
              <polyline points="9 6 15 12 9 18"/>
            </svg>
          </span>
          <span className={styles.icon}>{getFileIcon('', 'directory')}</span>
          <span className={styles.dirName}>{name}</span>
        </div>
      )}
      {dirNames.map(dir => (
        <TreeDir key={dir} name={dir} node={node.dirs[dir]} depth={name ? depth + 1 : depth} repoPath={repoPath} onFileClick={onFileClick} onOpenFile={onOpenFile} onRestore={onRestore} selectedFile={selectedFile} selectedRepo={selectedRepo} commitHash={commitHash} selectedCommitHash={selectedCommitHash} />
      ))}
      {files.map(file => {
        const isSelected = selectedFile === file.fullPath && selectedRepo === repoPath
          && (commitHash || null) === (selectedCommitHash || null);
        return (
        <Dropdown key={`${commitHash || 'wt'}::${file.fullPath}`} menu={{ items: [
          { key: 'reveal', label: t('ui.contextMenu.revealInExplorer') },
          { key: 'copyPath', label: t('ui.contextMenu.copyPath') },
          { key: 'copyRelPath', label: t('ui.contextMenu.copyRelativePath') },
        ], onClick: ({ key }) => {
          const resolvedPath = repoPath && repoPath !== '.' ? `${repoPath}/${file.fullPath}` : file.fullPath;
          if (key === 'reveal') {
            fetch(apiUrl('/api/reveal-file'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: resolvedPath }) }).catch(() => {});
          } else if (key === 'copyPath') {
            fetch(apiUrl('/api/resolve-path'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: resolvedPath }) })
              .then(r => r.json()).then(data => { if (data.fullPath) navigator.clipboard.writeText(data.fullPath).then(() => message.success(t('ui.copied'))).catch(() => {}); }).catch(() => {});
          } else if (key === 'copyRelPath') {
            navigator.clipboard.writeText(resolvedPath).then(() => message.success(t('ui.copied'))).catch(() => {});
          }
        }}} trigger={['contextMenu']}>
          <div
            className={`${styles.changeItem} ${isSelected ? styles.changeItemSelected : ''}`}
            style={{ paddingLeft: 8 + (name ? depth + 1 : depth) * 16 }}
            onClick={() => onFileClick && onFileClick(repoPath, file.fullPath, commitHash || null)}
          >
            <span className={styles.icon}>{getFileIcon(file.name)}</span>
            <span className={styles.fileName}>{file.name}</span>
            <span className={styles.actions}>
              <span title={t('ui.gitChanges.openFile')} onClick={e => { e.stopPropagation(); onOpenFile && onOpenFile(repoPath, file.fullPath); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </span>
              {!commitHash && (
                <span title={t('ui.gitChanges.restoreFile')} onClick={e => { e.stopPropagation(); onRestore && onRestore(repoPath, file.fullPath, file.name); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                </span>
              )}
            </span>
            <span className={styles.status} style={{ color: STATUS_COLORS[file.status] || '#888' }}>
              {STATUS_LABELS[file.status] || file.status}
            </span>
          </div>
        </Dropdown>
        );
      })}
    </>
  );
}

function CommitRow({ commit, repoPath, expanded, onToggle, onFileClick, onOpenFile, selectedFile, selectedRepo, selectedCommitHash, depth = 0 }) {
  const dateLabel = (() => {
    if (!commit.date) return '';
    try {
      const d = new Date(commit.date);
      if (Number.isNaN(d.getTime())) return '';
      const now = new Date();
      const sameDay = d.toDateString() === now.toDateString();
      return sameDay
        ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch { return ''; }
  })();
  return (
    <>
      <div
        className={styles.commitItem}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={onToggle}
        title={commit.subject}
      >
        <span className={`${styles.commitArrow} ${expanded ? styles.commitArrowExpanded : ''}`}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 6 15 12 9 18"/>
          </svg>
        </span>
        <span className={styles.commitHash}>{commit.shortHash}</span>
        <span className={styles.commitSubject}>{commit.subject}</span>
        {commit.author && <span className={styles.commitMeta}>{commit.author}</span>}
        {dateLabel && <span className={styles.commitMeta}>{dateLabel}</span>}
        <span className={styles.commitFileBadge}>{commit.files.length}</span>
      </div>
      {expanded && commit.files.length > 0 && (
        <TreeDir
          name=""
          node={buildGitTree(commit.files)}
          depth={depth + 1}
          repoPath={repoPath}
          onFileClick={onFileClick}
          onOpenFile={onOpenFile}
          onRestore={null}
          selectedFile={selectedFile}
          selectedRepo={selectedRepo}
          commitHash={commit.hash}
          selectedCommitHash={selectedCommitHash}
        />
      )}
    </>
  );
}

export default function GitChanges({ style, onClose, onFileClick, onOpenFile, refreshTrigger }) {
  const [repos, setRepos] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [selectedCommitHash, setSelectedCommitHash] = useState(null);
  const [collapsedRepos, setCollapsedRepos] = useState(new Set());
  // Per-repo state: which "unpushed" section is collapsed, which commits are expanded.
  // Keys: repoPath. Values: bool / Set<hash>.
  const [collapsedUnpushed, setCollapsedUnpushed] = useState({});
  const [expandedCommits, setExpandedCommits] = useState({});
  const mounted = useRef(true);

  const refreshAllRepos = useCallback(() => {
    fetchAllRepos()
      .then(results => { if (mounted.current) setRepos(results); })
      .catch(() => {});
  }, []);

  const handleRestore = useCallback((repoPath, filePath, fileName) => {
    Modal.confirm({
      title: t('ui.gitChanges.restoreConfirm', { name: fileName }),
      okType: 'danger',
      okText: t('ui.gitChanges.restoreFile'),
      onOk: () => fetch(apiUrl('/api/git-restore'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, repo: repoPath }),
      }).then(r => {
        if (r.ok) refreshAllRepos();
      }),
    });
  }, [refreshAllRepos]);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    fetchAllRepos()
      .then(results => {
        if (mounted.current) {
          setRepos(results);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted.current) {
          setError('Failed to load git status');
          setLoading(false);
        }
      });
    return () => { mounted.current = false; };
  }, []);

  // 工具触发的增量刷新
  useEffect(() => {
    if (refreshTrigger > 0) refreshAllRepos();
  }, [refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const isSingleRepo = !repos || repos.length <= 1;

  // Aggregate insertions/deletions across all repos
  const totalInsertions = repos ? repos.reduce((sum, r) => sum + (r.insertions || 0), 0) : 0;
  const totalDeletions = repos ? repos.reduce((sum, r) => sum + (r.deletions || 0), 0) : 0;

  return (
    <div className={styles.gitChanges} style={style}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>
          {t('ui.gitChanges')}
          {(totalInsertions > 0 || totalDeletions > 0) && (
            <>
              {' '}<span className={`${styles.statBadge} ${styles.statInsert}`}>+{totalInsertions}</span>
              {' '}<span className={`${styles.statBadge} ${styles.statDelete}`}>-{totalDeletions}</span>
            </>
          )}
        </span>
        <button className={styles.collapseBtn} onClick={onClose} title="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="11 17 6 12 11 7"/>
            <polyline points="18 17 13 12 18 7"/>
          </svg>
        </button>
      </div>
      <div className={styles.changesContainer}>
        {loading && <div className={styles.loading}>Loading...</div>}
        {error && <div className={styles.error}>{error}</div>}
        {!loading && !error && (!repos || repos.length === 0) && (
          <div className={styles.empty}>No changes</div>
        )}
        {!loading && !error && repos && repos.map(repo => {
          const collapsed = collapsedRepos.has(repo.path);
          const baseDepth = isSingleRepo ? 0 : 1;
          const handleClickFile = (rp, fp, ch) => {
            setSelectedFile(fp); setSelectedRepo(rp); setSelectedCommitHash(ch || null);
            onFileClick && onFileClick(rp, fp, ch || null);
          };
          const showUnpushed = repo.hasUpstream && repo.commits && repo.commits.length > 0;
          const unpushedCollapsed = !!collapsedUnpushed[repo.path];
          const expandedSet = expandedCommits[repo.path] || new Set();
          const toggleCommit = (hash) => setExpandedCommits(prev => {
            const cur = prev[repo.path] ? new Set(prev[repo.path]) : new Set();
            cur.has(hash) ? cur.delete(hash) : cur.add(hash);
            return { ...prev, [repo.path]: cur };
          });
          const unpushedNode = showUnpushed && !unpushedCollapsed && (
            <>
              {repo.commits.map(c => (
                <CommitRow
                  key={c.hash}
                  commit={c}
                  repoPath={repo.path}
                  expanded={expandedSet.has(c.hash)}
                  onToggle={() => toggleCommit(c.hash)}
                  onFileClick={handleClickFile}
                  onOpenFile={onOpenFile}
                  selectedFile={selectedFile}
                  selectedRepo={selectedRepo}
                  selectedCommitHash={selectedCommitHash}
                  depth={baseDepth + 1}
                />
              ))}
            </>
          );
          const unpushedHeader = showUnpushed && (
            <div
              className={styles.unpushedHeader}
              style={{ paddingLeft: 8 + baseDepth * 16 }}
              onClick={() => setCollapsedUnpushed(prev => ({ ...prev, [repo.path]: !prev[repo.path] }))}
              title={repo.upstream ? `${repo.upstream}..HEAD` : ''}
            >
              <span className={`${styles.commitArrow} ${unpushedCollapsed ? '' : styles.commitArrowExpanded}`}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 6 15 12 9 18"/>
                </svg>
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <line x1="12" y1="19" x2="12" y2="5"/>
                <polyline points="5 12 12 5 19 12"/>
              </svg>
              <span className={styles.unpushedTitle}>{t('ui.gitChanges.unpushedCommits')}</span>
              <span className={styles.repoBadge}>{repo.commits.length}</span>
            </div>
          );
          const workingTreeTree = (
            <TreeDir
              name=""
              node={buildGitTree(repo.changes)}
              depth={baseDepth}
              repoPath={repo.path}
              onFileClick={handleClickFile}
              onOpenFile={onOpenFile}
              onRestore={handleRestore}
              selectedFile={selectedFile}
              selectedRepo={selectedRepo}
              commitHash={null}
              selectedCommitHash={selectedCommitHash}
            />
          );
          return isSingleRepo ? (
            <React.Fragment key={repo.path}>
              {unpushedHeader}
              {unpushedNode}
              {workingTreeTree}
            </React.Fragment>
          ) : (
            <React.Fragment key={repo.path}>
              <div
                className={styles.repoHeader}
                onClick={() => setCollapsedRepos(prev => {
                  const next = new Set(prev);
                  collapsed ? next.delete(repo.path) : next.add(repo.path);
                  return next;
                })}
              >
                <span className={`${styles.repoArrow} ${collapsed ? '' : styles.repoArrowExpanded}`}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 6 15 12 9 18"/>
                  </svg>
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
                  <path d="M18 9a9 9 0 0 1-9 9"/>
                </svg>
                <span className={styles.repoName}>{repo.name}</span>
                {(repo.insertions > 0 || repo.deletions > 0) && (
                  <>
                    <span className={`${styles.statBadge} ${styles.statInsert}`}>+{repo.insertions}</span>
                    <span className={`${styles.statBadge} ${styles.statDelete}`}>-{repo.deletions}</span>
                  </>
                )}
                <span className={styles.repoBadge}>{repo.changes.length}</span>
              </div>
              {!collapsed && (
                <>
                  {unpushedHeader}
                  {unpushedNode}
                  {workingTreeTree}
                </>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
