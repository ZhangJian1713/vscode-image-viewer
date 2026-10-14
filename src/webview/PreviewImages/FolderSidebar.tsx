import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button, Checkbox, Dropdown, Input, Tree } from 'antd'
import { FolderOutlined, MoreOutlined, SearchOutlined, MenuFoldOutlined, FilterOutlined } from '@ant-design/icons'
import { FolderFilterFields } from './FolderFilterFields'
import { folderAncestors, GalleryFolderIndex, isPathWithinFolder, visibleFolderRows } from './galleryModel'
import type { GalleryFolderHighlight } from './galleryViewportFolders'
import { centeredFolderScrollTop, FOLDER_TREE_ROW_HEIGHT } from './folderTreePosition'

import type { GalleryRevealRequest } from './galleryNavigation'

/* eslint-disable no-unused-vars -- callback signatures */
export interface FolderSidebarProps {
  includeFolders: string[]
  excludeFolders: string[]
  onApplyFilters: (include: string[], exclude: string[]) => void
  index: GalleryFolderIndex
  selected: string
  revealRequest?: GalleryRevealRequest
  countsPending?: boolean
  viewportHighlight: GalleryFolderHighlight | null
  expanded: string[]
  recursive: boolean
  width: number
  onSelect: (key: string) => void
  onExpanded: (keys: string[]) => void
  onWidth: (width: number) => void
  onHide: () => void
  onRecursive: (recursive: boolean) => void
  onRefresh: () => void
  onAction: (key: string, action: string) => void
}
/* eslint-enable no-unused-vars */

/** Virtualized tree + controlled expansion; directory counts come from the gallery's shared index. */
export const FolderSidebar: React.FC<FolderSidebarProps> = ({
  includeFolders,
  excludeFolders,
  onApplyFilters,
  index,
  selected,
  revealRequest,
  countsPending,
  viewportHighlight,
  expanded,
  recursive,
  width,
  onSelect,
  onExpanded,
  onWidth,
  onHide,
  onRefresh,
  onRecursive,
  onAction
}) => {

  const [query, setQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const hasFilters = includeFolders.length > 0 || excludeFolders.length > 0
  const [height, setHeight] = useState(0)
  const treeSlot = useRef<HTMLDivElement>(null)
  const treeRef = useRef<React.ElementRef<typeof Tree>>(null)
  const revealed = useRef('')
  const [spyCollapsed, setSpyCollapsed] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    if (revealRequest) { setQuery(''); setSpyCollapsed(new Set()) }
  }, [revealRequest])
  useEffect(() => setSpyCollapsed(new Set()), [viewportHighlight?.live, index.root])
  useLayoutEffect(() => {
    const element = treeSlot.current!
    const measure = () => setHeight(element.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const search = useMemo(() => {
    if (!query.trim()) {
      return null
    }
    const allowed = new Set<string>([index.root])
    const parents = new Set<string>()
    for (const folder of index.folders.values()) {
      if (!folder.name.toLowerCase().includes(query.toLowerCase())) {
        continue
      }
      folderAncestors(index, folder.key).forEach((key) => {
        allowed.add(key)
        parents.add(key)
      })
    }
    return { allowed, parents }
  }, [index, query])

  const highlightedPaths = useMemo(() => new Set(viewportHighlight?.paths || []), [viewportHighlight])
  const resolvedExpanded = useMemo(() => {
    // Live tracking replaces, rather than unions with, manual/search expansion.
    // Derive this afresh for each viewport; never persist branches passed during a drag.
    const next = new Set(viewportHighlight?.live ? [index.root] : expanded.filter((key) => index.folders.has(key)))
    if (!viewportHighlight?.live) {
      search?.parents.forEach((key) => next.add(key))
    }
    viewportHighlight?.paths.forEach((path) => {
      folderAncestors(index, path).slice(0, -1).forEach((key) => {
        if (viewportHighlight.live || !spyCollapsed.has(key)) {
          next.add(key)
        }
      })
    })
    spyCollapsed.forEach((key) => { if (!viewportHighlight?.live) { next.delete(key) } })
    return Array.from(next)
  }, [expanded, index, search, viewportHighlight, spyCollapsed])
  const viewportLive = viewportHighlight?.live
  const centeredScrollTop = useMemo(() => {
    if (!viewportLive) {
      return undefined
    }
    const rows = visibleFolderRows(index, new Set(resolvedExpanded))
      .filter((row) => !search || search.allowed.has(row.key))
    return centeredFolderScrollTop(rows, viewportHighlight.paths, height || 300)
  }, [viewportLive, viewportHighlight, index, resolvedExpanded, search, height])
  useEffect(() => {
    if (centeredScrollTop === undefined) {
      return
    }
    const frame = requestAnimationFrame(() => treeRef.current?.scrollTo(centeredScrollTop))
    return () => cancelAnimationFrame(frame)
  }, [centeredScrollTop, resolvedExpanded])
  useLayoutEffect(() => {
    if (!revealRequest || viewportLive || search || revealRequest.path !== selected) { return }
    const signature = `${revealRequest.id}\0${index.folders.size}\0${height}`
    if (signature === revealed.current) { return }
    const rows = visibleFolderRows(index, new Set(resolvedExpanded))
    const top = centeredFolderScrollTop(rows, [revealRequest.path], height || 300)
    if (top === undefined) { return }
    const frame = requestAnimationFrame(() => {
      treeRef.current?.scrollTo(top)
      revealed.current = signature
    })
    return () => cancelAnimationFrame(frame)
  }, [revealRequest, viewportLive, search, selected, index, height, resolvedExpanded])

  const setSubtreeExpanded = useCallback(
    (key: string, open: boolean) => {
      const next = new Set(expanded)
      for (const folder of index.folders.values()) {
        if (!isPathWithinFolder(folder.key, key)) {
          continue
        }
        if (open && folder.children.length) {
          next.add(folder.key)
        } else if (!open) {
          next.delete(folder.key)
        }
      }
      onExpanded(Array.from(next))
      setSpyCollapsed((old) => {
        const collapsed = new Set(old)
        if (open) {
          Array.from(collapsed).forEach((path) => { if (isPathWithinFolder(path, key)) { collapsed.delete(path) } })
        } else {
          collapsed.add(key)
        }
        return collapsed
      })
    },
    [index, expanded, onExpanded]
  )

  const treeData = useMemo(() => {
    const nodes = new Map<string, { key: string; title: string; children: any[]; isLeaf: boolean }>()
    index.folders.forEach((folder) => {
      if (!search || search.allowed.has(folder.key)) {
        nodes.set(folder.key, {
          key: folder.key,
          title: folder.name,
          children: [],
          isLeaf: folder.children.length === 0
        })
      }
    })
    nodes.forEach((node) => {
      node.children = index.folders
        .get(node.key)!
        .children.map((key) => nodes.get(key))
        .filter(Boolean)
    })
    return [nodes.get(index.root)!]
  }, [index, search])

  const menuFor = (key: string) => ({
    items: [
      { key: 'revealInExplorer', label: "Reveal in Explorer" },
      { key: 'revealInFileManager', label: "Reveal in File Manager" },
      { key: 'copyFullPath', label: "Copy folder path" },
      { key: 'copyRelativePath', label: "Copy project-relative path" },
      { type: 'divider' as const },
      { key: 'expand', label: "Expand all subfolders", disabled: !index.folders.get(key)?.children.length },
      { key: 'collapse', label: "Collapse all subfolders", disabled: !index.folders.get(key)?.children.length },
      { type: 'divider' as const },
      { key: 'exclude', label: "Exclude folder from scanning", disabled: key === index.root }
    ],
    onClick: ({ key: action, domEvent }) => {
      domEvent.stopPropagation()
      if (action === 'expand' || action === 'collapse') {
        setSubtreeExpanded(key, action === 'expand')
      } else {
        onAction(key, action)
      }
    }
  })

  const resizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.currentTarget
    const startX = event.clientX
    const startWidth = target.parentElement!.getBoundingClientRect().width
    target.setPointerCapture(event.pointerId)
    const move = (moveEvent: PointerEvent) =>
      onWidth(Math.max(160, Math.min(440, startWidth + moveEvent.clientX - startX)))
    const end = () => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', end)
      target.removeEventListener('pointercancel', end)
      target.removeEventListener('lostpointercapture', end)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', end)
    target.addEventListener('pointercancel', end)
    target.addEventListener('lostpointercapture', end)
  }

  return (
    <aside className='iv-folder-sidebar' aria-label={"Image folders sidebar"} style={{ width }}>
      <div className='iv-folder-heading'>
        <strong>{"Image folders"}</strong>
        <Dropdown
          menu={{
            items: [
              {
                key: 'recursive',
                label: (
                  <Checkbox
                    checked={recursive}
                    onChange={(event) => onRecursive(event.target.checked)}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {"Include subfolders"}
                  </Checkbox>
                )
              },
              { type: 'divider' },
              { key: 'expand', label: "Expand all" },
              { key: 'collapse', label: "Collapse all" },
              { key: 'refresh', label: "Refresh images" }
            ],
            onClick: ({ key }) => {
              if (key === 'recursive') {
                onRecursive(!recursive)
              } else if (key === 'refresh') {
                onRefresh()
              } else {
                setSubtreeExpanded(index.root, key === 'expand')
              }
            }
          }}
          trigger={['click']}
          getPopupContainer={() => document.body}
        >
          <Button type='text' size='small' icon={<MoreOutlined />} aria-label={"Image folder options"} />
        </Dropdown>
        <Button
          type='text'
          size='small'
          icon={<MenuFoldOutlined />}
          aria-label={"Hide sidebar"}
          title={"Hide sidebar"}
          onClick={onHide}
        />
      </div>
      <div className='iv-folder-search-row'>
        <Input
          className='iv-folder-search'
          size='small'
          prefix={<SearchOutlined />}
          placeholder={"Find folder"}
          value={query}
          allowClear
          onChange={(event) => setQuery(event.target.value)}
          aria-label={"Find folder"}
        />
        <Button
          type='text'
          size='small'
          icon={<FilterOutlined />}
          aria-label={"Folder filters"}
          aria-expanded={filtersOpen}
          aria-pressed={hasFilters}
          className={hasFilters ? 'iv-filter-active' : ''}
          title={(hasFilters ? "Folder filters (active)" : "Folder filters")}
          onClick={() => setFiltersOpen((open) => !open)}
        />
      </div>
      {filtersOpen && (
        <FolderFilterFields
          key={JSON.stringify([includeFolders, excludeFolders])}
          includeFolders={includeFolders}
          excludeFolders={excludeFolders}
          onApply={onApplyFilters}
        />
      )}
      <div className='iv-folder-tree-slot' ref={treeSlot}
        style={{ '--iv-folder-row-height': `${FOLDER_TREE_ROW_HEIGHT}px` } as React.CSSProperties}>
        <Tree
          ref={treeRef}
          key={index.root}
          motion={null}
          height={height || 300}
          itemHeight={FOLDER_TREE_ROW_HEIGHT}
          virtual
          blockNode
          treeData={treeData}
          selectedKeys={[selected]}
          expandedKeys={resolvedExpanded}
          onExpand={(_keys, info) => {
            // 只持久化用户操作的节点，不把临时定位展开的祖先整批写进配置。
            const key = String(info.node.key)
            const next = new Set(expanded)
            if (info.expanded) { next.add(key) } else { next.delete(key) }
            onExpanded(Array.from(next))
            setSpyCollapsed((old) => {
              const collapsed = new Set(old)
              if (info.expanded) { collapsed.delete(key) } else { collapsed.add(key) }
              return collapsed
            })
          }}
          onSelect={(keys) => {
            if (keys.length) {
              onSelect(String(keys[0]))
            }
          }}
          titleRender={(node) => {
            const folder = index.folders.get(String(node.key))
            // rc-tree can render a retiring node while its internal flattened data catches up.
            if (!folder) {
              return <span>{node.title as string}</span>
            }
            const menu = menuFor(folder.key)
            return (
              <Dropdown menu={menu} trigger={['contextMenu']} getPopupContainer={() => document.body}>
                <span
                  className={`iv-folder-title${highlightedPaths.has(folder.key) ? ' is-in-viewport' : ''}`}
                  data-folder-path={folder.key}
                  title={`${folder.key}\n${`${(folder.directCount).toLocaleString()} directly · ${(folder.totalCount).toLocaleString()} including subfolders`}${countsPending ? `\n${"Indexing remaining project folders…"}` : ''}`}
                >
                  <FolderOutlined />
                  <span className='iv-folder-name'>{folder.name}</span>
                  <span className='iv-folder-count'>{(recursive ? folder.totalCount : folder.directCount).toLocaleString()}{countsPending ? '+' : ''}</span>
                  <Dropdown menu={menu} trigger={['click']} getPopupContainer={() => document.body}>
                    <button
                      className='iv-folder-menu'
                      aria-label={`Actions for folder ${folder.name}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <MoreOutlined />
                    </button>
                  </Dropdown>
                </span>
              </Dropdown>
            )
          }}
        />
      </div>
      <div className='iv-folder-footer'>{(recursive ? "Counts include subfolders" : "Counts show direct images")}</div>
      <div
        className='iv-sidebar-resizer'
        role='separator'
        aria-label={"Resize sidebar"}
        aria-orientation='vertical'
        onPointerDown={resizeStart}
      />
    </aside>
  )
}
