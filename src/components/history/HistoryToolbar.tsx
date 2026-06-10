'use client'

import { memo } from 'react'
import {
  Download,
  FileJson,
  Grid3x3,
  List,
  MoreHorizontal,
  RefreshCw,
  Search,
  Star,
  Tag as TagIcon,
  Trash2,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { HistorySortOption, HistoryViewMode, Tag, TaskStatus } from '@/types'

export interface HistoryQuickFilterChip {
  key: string
  label: string
  active: boolean
  onClick: () => void
  hidden?: boolean
}

export interface HistoryActiveFilterBadge {
  key: string
  label: string
  onRemove: () => void
}

export interface HistorySelectedContextSummary {
  kindLabel: string
  mediaLabel: string
  statusLabel: string
  statusBadgeClassName: string
  relativeTime: string
  title: string
}

interface HistoryToolbarProps {
  selectedContext: HistorySelectedContextSummary | null
  searchTerm: string
  onSearchTermChange: (value: string) => void
  viewMode: HistoryViewMode
  onViewModeChange: (mode: HistoryViewMode) => void
  filterType: 'all' | 'single' | 'batch'
  onFilterTypeChange: (value: 'all' | 'single' | 'batch') => void
  filterStatus: 'all' | TaskStatus
  onFilterStatusChange: (value: 'all' | TaskStatus) => void
  sortOption: HistorySortOption
  onSortOptionChange: (value: HistorySortOption) => void
  showFavoritesOnly: boolean
  onToggleFavorites: () => void
  tags: Tag[]
  selectedTags: string[]
  onToggleTag: (tagId: string) => void
  tagColors: Record<string, string>
  quickFilterChips: HistoryQuickFilterChip[]
  activeFilterBadges: HistoryActiveFilterBadge[]
  filteredRecordsCount: number
  totalRecordsCount: number
  hasActiveFilters: boolean
  onClearFilters: () => void
  batchSelectMode: boolean
  paginatedRecordsCount: number
  selectedRecordCount: number
  onToggleBatchSelect: () => void
  onSelectCurrentPage: () => void
  onClearSelection: () => void
  onBatchDelete: () => void
  onOpenTagDialog: () => void
  onExportCSV: () => void
  onExportJSON: () => void
  onRefresh: () => void
  refreshingCloud: boolean
  authLoading: boolean
  onClearHistory: () => void
}

function HistoryToolbarComponent({
  selectedContext,
  searchTerm,
  onSearchTermChange,
  viewMode,
  onViewModeChange,
  filterType,
  onFilterTypeChange,
  filterStatus,
  onFilterStatusChange,
  sortOption,
  onSortOptionChange,
  showFavoritesOnly,
  onToggleFavorites,
  tags,
  selectedTags,
  onToggleTag,
  tagColors,
  quickFilterChips,
  activeFilterBadges,
  filteredRecordsCount,
  totalRecordsCount,
  hasActiveFilters,
  onClearFilters,
  batchSelectMode,
  paginatedRecordsCount,
  selectedRecordCount,
  onToggleBatchSelect,
  onSelectCurrentPage,
  onClearSelection,
  onBatchDelete,
  onOpenTagDialog,
  onExportCSV,
  onExportJSON,
  onRefresh,
  refreshingCloud,
  authLoading,
  onClearHistory,
}: HistoryToolbarProps) {
  return (
    <>
      <div className="mb-4">
        {selectedContext ? (
          <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/20">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                {selectedContext.kindLabel}
              </Badge>
              <Badge variant="outline">{selectedContext.mediaLabel}</Badge>
              <Badge className={selectedContext.statusBadgeClassName} variant="outline">
                {selectedContext.statusLabel}
              </Badge>
              <span className="text-sm text-muted-foreground">{selectedContext.relativeTime}</span>
            </div>
            <div className="mt-2 line-clamp-1 text-sm font-medium">
              {selectedContext.title}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-background/70 px-4 py-3 text-sm text-muted-foreground">
            当前未选中记录。可从左侧列表或下方网格选择一条，右侧会显示预览和详情。
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索视频标题或链接..."
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex gap-2">
          <div className="flex overflow-hidden rounded-lg border">
            <Button
              variant={viewMode === HistoryViewMode.LIST ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onViewModeChange(HistoryViewMode.LIST)}
              className="rounded-none"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === HistoryViewMode.GRID ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onViewModeChange(HistoryViewMode.GRID)}
              className="rounded-none"
            >
              <Grid3x3 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={filterType}
          onChange={(event) => onFilterTypeChange(event.target.value as 'all' | 'single' | 'batch')}
          className="rounded-lg border bg-background px-3 py-1.5 text-sm"
        >
          <option value="all">所有类型</option>
          <option value="single">单链接</option>
          <option value="batch">批量</option>
        </select>

        <select
          value={filterStatus}
          onChange={(event) => onFilterStatusChange(event.target.value as 'all' | TaskStatus)}
          className="rounded-lg border bg-background px-3 py-1.5 text-sm"
        >
          <option value="all">所有状态</option>
          <option value={TaskStatus.SUCCESS}>成功</option>
          <option value={TaskStatus.FAILED}>失败</option>
          <option value={TaskStatus.PENDING}>等待中</option>
        </select>

        <select
          value={sortOption}
          onChange={(event) => onSortOptionChange(event.target.value as HistorySortOption)}
          className="rounded-lg border bg-background px-3 py-1.5 text-sm"
        >
          <option value={HistorySortOption.DATE_DESC}>时间 (最新)</option>
          <option value={HistorySortOption.DATE_ASC}>时间 (最旧)</option>
          <option value={HistorySortOption.TITLE_ASC}>标题 (A-Z)</option>
          <option value={HistorySortOption.TITLE_DESC}>标题 (Z-A)</option>
          <option value={HistorySortOption.STATUS}>状态</option>
        </select>

        <Button
          variant={showFavoritesOnly ? 'default' : 'outline'}
          size="sm"
          onClick={onToggleFavorites}
        >
          <Star className={`mr-1 h-4 w-4 ${showFavoritesOnly ? 'fill-current' : ''}`} />
          收藏
        </Button>

        {tags.map(tag => (
          <Badge
            key={tag.id}
            onClick={() => onToggleTag(tag.id)}
            className={`cursor-pointer ${
              selectedTags.includes(tag.id)
                ? tagColors[tag.color as keyof typeof tagColors] || tagColors.gray
                : 'bg-muted text-muted-foreground'
            }`}
            variant="outline"
          >
            {tag.name}
          </Badge>
        ))}
      </div>

      {quickFilterChips.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {quickFilterChips.map(chip => (
            <Button
              key={chip.key}
              variant={chip.active ? 'default' : 'outline'}
              size="sm"
              onClick={chip.onClick}
              className="h-8"
            >
              {chip.label}
            </Button>
          ))}
        </div>
      )}

      {activeFilterBadges.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {activeFilterBadges.map(item => (
            <Badge key={item.key} variant="outline" className="gap-1 px-2 py-1 text-xs">
              {item.label}
              <button
                type="button"
                onClick={item.onRemove}
                className="ml-1 rounded-sm text-muted-foreground hover:text-foreground"
                aria-label={`移除筛选 ${item.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            显示 {filteredRecordsCount} / {totalRecordsCount} 条记录
          </span>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={onClearFilters}>
              <X className="mr-1 h-3 w-3" />
              清除筛选
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant={batchSelectMode ? 'default' : 'outline'} size="sm" onClick={onToggleBatchSelect}>
            {batchSelectMode ? '退出多选' : '批量选择'}
          </Button>
          {batchSelectMode && (
            <>
              <Button variant="outline" size="sm" onClick={onSelectCurrentPage}>
                全选本页 ({paginatedRecordsCount})
              </Button>
              <Button variant="outline" size="sm" onClick={onClearSelection}>
                清空选择
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={onBatchDelete}
                disabled={selectedRecordCount === 0}
              >
                删除所选 ({selectedRecordCount})
              </Button>
            </>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreHorizontal className="mr-1 h-4 w-4" />
                更多操作
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>历史记录工具</DropdownMenuLabel>
              <DropdownMenuItem onClick={onOpenTagDialog}>
                <TagIcon className="mr-2 h-4 w-4" />
                管理标签
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExportCSV}>
                <Download className="mr-2 h-4 w-4" />
                导出 CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExportJSON}>
                <FileJson className="mr-2 h-4 w-4" />
                导出 JSON
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onRefresh}
                disabled={refreshingCloud || authLoading}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {refreshingCloud ? '云端同步中...' : '刷新记录'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onClearHistory}
                disabled={totalRecordsCount === 0}
                className="text-red-600 focus:text-red-600"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                清空历史
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </>
  )
}

export const HistoryToolbar = memo(HistoryToolbarComponent)
