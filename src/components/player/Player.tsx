'use client'

import React from 'react';
import { ParsedVideoInfo } from '@/types';
import { VideoPreview } from '@/components/preview/VideoPreview';
import { Play, Pause, Volume2, VolumeX, Maximize, Settings, ArrowLeftRight } from 'lucide-react';

interface PlayerProps {
  mediaInfo: ParsedVideoInfo;
}

export function Player({ mediaInfo }: PlayerProps) {
  return (
    <div className="space-y-3">
      {/* Video Title */}
      <h1 className="text-2xl font-bold text-gray-900">
        {mediaInfo.title || '未知标题'}
      </h1>

      {/* Video Player */}
      <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
        <VideoPreview
          videoUrl={mediaInfo.url!}
          thumbnail={mediaInfo.thumbnail}
          className="w-full h-full"
        />
      </div>

      {/* Custom Controls */}
      <div className="bg-white p-3 rounded-lg shadow-sm space-y-2">
        {/* Progress Bar */}
        <div className="w-full h-2 bg-gray-200 rounded-full cursor-pointer">
          <div className="h-full bg-blue-600 rounded-full" style={{ width: '45%' }}></div>
        </div>

        {/* Control Buttons */}
        <div className="flex items-center justify-between text-gray-600">
          <div className="flex items-center space-x-3">
            <button className="hover:text-gray-900"><Play className="w-5 h-5" /></button>
            <button className="hover:text-gray-900"><Volume2 className="w-5 h-5" /></button>
            <span className="text-xs font-mono">1:23 / 4:56</span>
          </div>
          <div className="flex items-center space-x-3">
            <button className="hover:text-gray-900"><ArrowLeftRight className="w-5 h-5" /></button>
            <button className="hover:text-gray-900"><Settings className="w-5 h-5" /></button>
            <button className="hover:text-gray-900"><Maximize className="w-5 h-5" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}