'use client'

import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from '@/components/ui/button';

interface UserInfoProps {
  author?: string;
  avatar?: string;
}

export function UserInfo({ author, avatar }: UserInfoProps) {
  return (
    <div className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm">
      <div className="flex items-center space-x-3">
        <Avatar>
          <AvatarImage src={avatar} alt={author} />
          <AvatarFallback>{author?.charAt(0) || 'U'}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-semibold text-gray-800">{author || '匿名用户'}</p>
          <p className="text-xs text-gray-500">1.2M 订阅者</p>
        </div>
      </div>
      <Button variant="destructive" size="sm">订阅</Button>
    </div>
  );
}