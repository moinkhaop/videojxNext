'use client'

import { Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tag } from '@/types'

interface TagManagerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tags: Tag[]
  tagColors: Record<string, string>
  newTagName: string
  newTagColor: string
  onNewTagNameChange: (value: string) => void
  onNewTagColorChange: (value: string) => void
  onDeleteTag: (tagId: string) => void
  onAddTag: () => void
}

export function TagManagerDialog({
  open,
  onOpenChange,
  tags,
  tagColors,
  newTagName,
  newTagColor,
  onNewTagNameChange,
  onNewTagColorChange,
  onDeleteTag,
  onAddTag,
}: TagManagerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>管理标签</DialogTitle>
          <DialogDescription>
            添加、编辑或删除标签
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>标签列表</Label>
            <div className="max-h-60 space-y-2 overflow-y-auto">
              {tags.map(tag => (
                <div key={tag.id} className="flex items-center justify-between rounded border p-2">
                  <Badge
                    className={tagColors[tag.color as keyof typeof tagColors] || tagColors.gray}
                    variant="outline"
                  >
                    {tag.name}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDeleteTag(tag.id)}
                    className="text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>添加新标签</Label>
            <Input
              placeholder="标签名称"
              value={newTagName}
              onChange={(e) => onNewTagNameChange(e.target.value)}
            />
            <div className="flex gap-2">
              {Object.keys(tagColors).map(color => (
                <button
                  type="button"
                  key={color}
                  onClick={() => onNewTagColorChange(color)}
                  className={`h-8 w-8 rounded border-2 ${
                    newTagColor === color ? 'border-black dark:border-white' : 'border-transparent'
                  } ${tagColors[color as keyof typeof tagColors]}`}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={onAddTag}>添加标签</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
