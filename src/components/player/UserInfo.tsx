'use client'

import React from 'react';
import { EnhancedAvatar } from "@/components/ui/enhanced-avatar";
import { Button } from '@/components/ui/button';

interface UserInfoProps {
  author?: string;
  avatar?: string;
}

export function UserInfo({ author, avatar }: UserInfoProps) {
  const authorName = author || '匿名用户'
  const fallbackText = author?.charAt(0)?.toUpperCase() || 'U'

  return (
    <div className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm">
      <div className="flex items-center space-x-3">
        <EnhancedAvatar
          src={avatar}
          alt={authorName}
          fallbackText={fallbackText}
          size="md"
          showBorder={true}
        />
        <div>
          <p className="font-semibold text-gray-800">{authorName}</p>
          <p className="text-xs text-gray-500">1.2M 订阅者</p>
        </div>
      </div>
      <Button variant="destructive" size="sm">订阅</Button>
    </div>
  );
}