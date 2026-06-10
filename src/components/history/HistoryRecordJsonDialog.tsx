'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface HistoryRecordJsonDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  jsonText: string
}

export function HistoryRecordJsonDialog({
  open,
  onOpenChange,
  jsonText,
}: HistoryRecordJsonDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>记录详情</DialogTitle>
          <DialogDescription>
            查看完整历史记录数据（JSON）
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-auto rounded-md border bg-muted/20 p-4">
          <pre className="whitespace-pre-wrap break-all text-xs leading-5">
            {jsonText}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  )
}
