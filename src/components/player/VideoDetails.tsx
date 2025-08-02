'use client'

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';

interface VideoDetailsProps {
  views?: string;
  uploadDate?: string;
  description?: string;
}

export function VideoDetails({ views, uploadDate, description }: VideoDetailsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="p-3 bg-gray-100 rounded-lg text-sm">
      <div className="flex items-center space-x-2 font-semibold text-gray-800 mb-2">
        <span>{views || '无观看次数'}</span>
        <span>•</span>
        <span>{uploadDate || '未知上传日期'}</span>
      </div>
      <div className={`text-gray-700 leading-relaxed ${isExpanded ? '' : 'line-clamp-2'}`}>
        {description || '暂无简介'}
      </div>
      {description && description.length > 100 && (
        <Button variant="link" size="sm" onClick={() => setIsExpanded(!isExpanded)} className="p-0 h-auto mt-1">
          {isExpanded ? '收起' : '...更多'}
        </Button>
      )}
    </div>
  );
}