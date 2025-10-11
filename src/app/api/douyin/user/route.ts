import { NextRequest, NextResponse } from 'next/server';
import { DouyinUserApiResponse, DouyinUserParseRequest, DouyinVideoItem, ParsedVideoInfo, MediaType } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body: DouyinUserParseRequest = await request.json();
    const { url, limit = 20 } = body;
    
    if (!url) {
      return NextResponse.json(
        { error: '缺少用户主页URL参数' },
        { status: 400 }
      );
    }

    // 调用抖音用户解析API
    const apiUrl = `https://api.cenguigui.cn/api/douyin/user.php?url=${encodeURIComponent(url)}`;
    
    console.log('调用抖音用户解析API:', apiUrl);
    
    // {{ AURA: Modify - 修复fetch超时配置错误 }}
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status}`);
    }

    const apiResponseData: DouyinUserApiResponse = await response.json();
    
    // 检查API响应状态
    if (apiResponseData.code !== 200) {
      return NextResponse.json(
        { error: apiResponseData.msg || '解析失败' },
        { status: 400 }
      );
    }

    if (!apiResponseData.data || apiResponseData.data.length === 0) {
      return NextResponse.json(
        { error: '未找到该用户的视频内容' },
        { status: 404 }
      );
    }

    // {{ AURA: Add - 转换抖音API数据为标准格式 }}
    const convertDouyinToStandard = (item: DouyinVideoItem): ParsedVideoInfo => {
      return {
        title: item.title || `${item.author}的视频`,
        author: item.author || item.nickname,
        avatar: item.avatar,
        signature: item.nickname,
        time: item.time,
        description: item.title,
        mediaType: MediaType.VIDEO,
        viewCount: item.play?.toString() || '0',
        uploadDate: item.time,
        
        // 视频相关字段
        url: item.video_info?.download || item.video_info?.url,
        duration: undefined, // API未提供准确时长
        fileSize: undefined,
        format: 'mp4',
        thumbnail: item.pic,
        
        // 图集相关字段 (当前为视频，暂不使用)
        images: undefined,
        imageCount: undefined,
      };
    };

    // 应用限制并转换数据
    const limitedData = limit ? apiResponseData.data.slice(0, limit) : apiResponseData.data;
    const convertedVideos = limitedData.map(convertDouyinToStandard);

    return NextResponse.json({
      success: true,
      data: {
        videos: convertedVideos,
        totalCount: apiResponseData.data.length,
        limitApplied: limit,
        actualCount: convertedVideos.length,
        userInfo: {
          nickname: apiResponseData.data[0]?.nickname,
          avatar: apiResponseData.data[0]?.avatar,
        }
      },
      rawData: apiResponseData // 保留原始数据用于调试
    });

  } catch (error) {
    console.error('抖音用户解析失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '服务器错误，请稍后重试' },
      { status: 500 }
    );
  }
}