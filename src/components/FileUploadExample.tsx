'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertCircle, Upload, FileText, AlertTriangle } from 'lucide-react';
import { ConversionService } from '@/lib/conversion';
import { FilenameSanitizer } from '@/lib/filename-sanitizer';

interface FileValidationResult {
  original: string;
  sanitized: string;
  isValid: boolean;
  issues: string[];
  specialChars: string[];
}

export default function FileUploadExample() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [validationResults, setValidationResults] = useState<FileValidationResult[]>([]);
  const [showResults, setShowResults] = useState(false);

  // 处理文件选择
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setSelectedFiles(files);
    
    if (files.length > 0) {
      validateFilenames(files);
    } else {
      setValidationResults([]);
      setShowResults(false);
    }
  };

  // 验证和规范化文件名
  const validateFilenames = (files: File[]) => {
    const results: FileValidationResult[] = files.map(file => {
      const validation = ConversionService.validateFilename(file.name);
      const specialChars = FilenameSanitizer.detectSpecialChars(file.name);
      
      return {
        original: file.name,
        sanitized: validation.sanitized,
        isValid: validation.isValid,
        issues: validation.issues,
        specialChars: specialChars
      };
    });

    setValidationResults(results);
    setShowResults(true);
  };

  // 清空文件选择
  const clearFiles = () => {
    setSelectedFiles([]);
    setValidationResults([]);
    setShowResults(false);
  };

  const hasIssues = validationResults.some(result => !result.isValid);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Upload className="w-5 h-5" />
            <span>文件名规范化演示</span>
          </CardTitle>
          <CardDescription>
            选择文件以查看文件名规范化效果。系统会自动检测和处理特殊符号。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 文件选择 */}
          <div>
            <label className="text-sm font-medium mb-2 block">选择文件</label>
            <div className="flex space-x-2">
              <Input
                type="file"
                multiple
                onChange={handleFileSelect}
                className="flex-1"
                accept="*/*"
              />
              {selectedFiles.length > 0 && (
                <Button variant="outline" onClick={clearFiles}>
                  清空
                </Button>
              )}
            </div>
          </div>

          {/* 总体状态提示 */}
          {showResults && (
            <Alert className={hasIssues ? "border-orange-200 bg-orange-50" : "border-green-200 bg-green-50"}>
              {hasIssues ? (
                <AlertCircle className="h-4 w-4 text-orange-500" />
              ) : (
                <CheckCircle className="h-4 w-4 text-green-500" />
              )}
              <AlertDescription className={hasIssues ? "text-orange-700" : "text-green-700"}>
                {hasIssues 
                  ? `检测到 ${validationResults.filter(r => !r.isValid).length} 个文件名需要规范化处理`
                  : `所有 ${validationResults.length} 个文件名均符合规范`
                }
              </AlertDescription>
            </Alert>
          )}

          {/* 文件验证结果 */}
          {showResults && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">验证结果</h3>
              
              {validationResults.map((result, index) => (
                <Card key={index} className={`border-l-4 ${result.isValid ? 'border-l-green-500' : 'border-l-orange-500'}`}>
                  <CardContent className="pt-4">
                    <div className="space-y-3">
                      {/* 文件名对比 */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">原始文件名</label>
                          <div className="mt-1 p-2 bg-gray-50 rounded border font-mono text-sm">
                            {result.original}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">规范化后</label>
                          <div className="mt-1 p-2 bg-green-50 rounded border font-mono text-sm">
                            {result.sanitized}
                          </div>
                        </div>
                      </div>

                      {/* 状态标识 */}
                      <div className="flex items-center space-x-2">
                        {result.isValid ? (
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            符合规范
                          </Badge>
                        ) : (
                          <Badge className="bg-orange-100 text-orange-800">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            需要处理
                          </Badge>
                        )}
                        
                        {result.specialChars.length > 0 && (
                          <Badge variant="outline" className="text-red-600 border-red-200">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            特殊符号: {result.specialChars.join(', ')}
                          </Badge>
                        )}
                      </div>

                      {/* 问题列表 */}
                      {result.issues.length > 0 && (
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-orange-600 uppercase tracking-wide">检测到的问题</label>
                          <ul className="list-disc list-inside text-sm text-orange-700 space-y-1 ml-4">
                            {result.issues.map((issue, issueIndex) => (
                              <li key={issueIndex}>{issue}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* 支持的格式说明 */}
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center space-x-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <span className="text-blue-800">支持的文件格式</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <h4 className="font-medium text-blue-800 mb-2">视频格式</h4>
                  <div className="flex flex-wrap gap-1">
                    {['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv'].map(ext => (
                      <Badge key={ext} variant="secondary" className="text-xs">{ext}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-medium text-blue-800 mb-2">图片格式</h4>
                  <div className="flex flex-wrap gap-1">
                    {['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].map(ext => (
                      <Badge key={ext} variant="secondary" className="text-xs">{ext}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-medium text-blue-800 mb-2">音频格式</h4>
                  <div className="flex flex-wrap gap-1">
                    {['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'].map(ext => (
                      <Badge key={ext} variant="secondary" className="text-xs">{ext}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 使用说明 */}
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">文件名规范化规则</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="list-disc list-inside text-sm space-y-1 text-gray-600">
                <li>自动检测和替换特殊符号：# % & @ ! * ( ) [ ] { } | \ : ; " ' &lt; &gt; ? /</li>
                <li>移除控制字符和不可见字符</li>
                <li>处理Windows系统保留名称（如CON、PRN、AUX等）</li>
                <li>限制文件名长度，避免系统兼容性问题</li>
                <li>合并连续的替换字符，保持文件名简洁</li>
                <li>保留文件扩展名，确保文件类型识别</li>
                <li>处理重复文件名，自动添加序号避免冲突</li>
              </ul>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}