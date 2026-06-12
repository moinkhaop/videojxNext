-- =====================================================
-- Supabase 个人资料管理系统配置脚本
-- =====================================================
-- 此脚本用于配置头像存储和相关权限
-- 运行环境：Supabase SQL Editor
-- =====================================================

-- 1. 启用 Storage 扩展（如果尚未启用）
-- create extension if not exists "storage" schema extensions;

-- 2. 创建 avatars bucket (如果不存在)
-- 注意：这个操作需要在 Supabase Dashboard 的 Storage 页面手动完成
-- 或者使用以下 SQL 创建：
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,  -- 公开访问
  2097152,  -- 2MB = 2 * 1024 * 1024 bytes
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
on conflict (id) do nothing;

-- 3. 删除现有的 avatars bucket 策略（如果存在）
drop policy if exists "Public avatar access" on storage.objects;
drop policy if exists "Users can upload own avatar" on storage.objects;
drop policy if exists "Users can update own avatar" on storage.objects;
drop policy if exists "Users can delete own avatar" on storage.objects;

-- 4. 创建新的存储策略

-- 策略 1: 允许所有人读取头像（公开访问）
create policy "Public avatar access"
on storage.objects for select
using (bucket_id = 'avatars');

-- 策略 2: 允许认证用户上传自己的头像
create policy "Users can upload own avatar"
on storage.objects for insert
with check (
  bucket_id = 'avatars' 
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- 策略 3: 允许用户更新自己的头像
create policy "Users can update own avatar"
on storage.objects for update
using (
  bucket_id = 'avatars' 
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'avatars' 
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- 策略 4: 允许用户删除自己的头像
create policy "Users can delete own avatar"
on storage.objects for delete
using (
  bucket_id = 'avatars' 
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- 5. 验证策略是否创建成功
-- 运行以下查询检查策略
select 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
from pg_policies
where tablename = 'objects' 
  and policyname like '%avatar%'
order by policyname;

-- 6. 检查 bucket 配置
select 
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,
  created_at
from storage.buckets
where id = 'avatars';

-- =====================================================
-- 测试脚本
-- =====================================================

-- 测试 1: 检查当前用户是否可以访问 avatars bucket
-- 注意：需要在登录状态下运行
select 
  auth.uid() as current_user_id,
  case 
    when auth.uid() is null then '未登录'
    else '已登录'
  end as login_status;

-- 测试 2: 列出 avatars bucket 中的所有文件
select 
  name,
  id,
  bucket_id,
  owner,
  created_at,
  metadata
from storage.objects
where bucket_id = 'avatars'
order by created_at desc
limit 10;

-- =====================================================
-- 清理脚本（慎用！）
-- =====================================================

-- 如果需要完全重置，取消注释以下代码：

/*
-- 删除所有头像文件
delete from storage.objects where bucket_id = 'avatars';

-- 删除所有策略
drop policy if exists "Public avatar access" on storage.objects;
drop policy if exists "Users can upload own avatar" on storage.objects;
drop policy if exists "Users can update own avatar" on storage.objects;
drop policy if exists "Users can delete own avatar" on storage.objects;

-- 删除 bucket
delete from storage.buckets where id = 'avatars';
*/
