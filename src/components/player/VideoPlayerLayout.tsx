'use client'

import React from 'react';
import { Player } from '@/components/player/Player';
import { Sidebar } from '@/components/player/Sidebar';
import { ParsedVideoInfo } from '@/types';

interface VideoPlayerLayoutProps {
  mediaInfo: ParsedVideoInfo;
}

export function VideoPlayerLayout({ mediaInfo }: VideoPlayerLayoutProps) {
  return (
    <div className="flex flex-col lg:flex-row gap-6 p-4 max-w-screen-2xl mx-auto bg-gray-50">
      {/* Left Column: Video Player */}
      <div className="w-full lg:w-[65%]">
        <Player mediaInfo={mediaInfo} />
      </div>

      {/* Right Column: Sidebar */}
      <div className="w-full lg:w-[35%]">
        <Sidebar mediaInfo={mediaInfo} />
      </div>
    </div>
  );
}