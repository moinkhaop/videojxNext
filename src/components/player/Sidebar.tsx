'use client'

import React from 'react';
import { ParsedVideoInfo } from '@/types';
import { UserInfo } from '@/components/player/UserInfo';
import { ActionButtons } from '@/components/player/ActionButtons';
import { VideoDetails } from '@/components/player/VideoDetails';
import { RelatedVideos } from '@/components/player/RelatedVideos';

interface SidebarProps {
  mediaInfo: ParsedVideoInfo;
}

export function Sidebar({ mediaInfo }: SidebarProps) {
  return (
    <div className="space-y-4">
      <UserInfo author={mediaInfo.author} />
      <ActionButtons />
      <VideoDetails 
        views={mediaInfo.viewCount} 
        uploadDate={mediaInfo.uploadDate}
        description={mediaInfo.description}
      />
      <RelatedVideos />
    </div>
  );
}