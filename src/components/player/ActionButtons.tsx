'use client'

import React from 'react';
import { Button } from '@/components/ui/button';
import { ThumbsUp, ThumbsDown, Share2, ListPlus, Download } from 'lucide-react';

export function ActionButtons() {
  return (
    <div className="flex items-center space-x-2 bg-white p-2 rounded-lg shadow-sm">
      <Button variant="ghost" className="flex-1">
        <ThumbsUp className="w-5 h-5 mr-2" />
        <span>1.2K</span>
      </Button>
      <Button variant="ghost" className="flex-1">
        <ThumbsDown className="w-5 h-5" />
      </Button>
      <Button variant="ghost" className="flex-1">
        <Share2 className="w-5 h-5 mr-2" />
        <span>分享</span>
      </Button>
      <Button variant="ghost" className="flex-1">
        <ListPlus className="w-5 h-5 mr-2" />
        <span>保存</span>
      </Button>
      <Button variant="ghost" className="flex-1">
        <Download className="w-5 h-5 mr-2" />
        <span>下载</span>
      </Button>
    </div>
  );
}