'use client'

import React from 'react';

export function RelatedVideos() {
  // Placeholder data
  const relatedVideos = [
    { id: 1, title: '相关视频 1', author: '作者 A', views: '1.1M', duration: '10:32', thumbnail: '/placeholder.svg' },
    { id: 2, title: '相关视频 2', author: '作者 B', views: '2.3M', duration: '05:12', thumbnail: '/placeholder.svg' },
    { id: 3, title: '相关视频 3', author: '作者 C', views: '876K', duration: '12:45', thumbnail: '/placeholder.svg' },
  ];

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-gray-900">接下来播放</h3>
      {relatedVideos.map(video => (
        <div key={video.id} className="flex items-start space-x-3 p-2 rounded-lg hover:bg-gray-100 cursor-pointer">
          <img src={video.thumbnail} alt={video.title} className="w-32 h-18 object-cover rounded-md bg-gray-200" />
          <div className="flex-1">
            <p className="font-semibold text-sm text-gray-800 line-clamp-2">{video.title}</p>
            <p className="text-xs text-gray-500">{video.author}</p>
            <p className="text-xs text-gray-500">{video.views} 次观看 • {video.duration}</p>
          </div>
        </div>
      ))}
    </div>
  );
}