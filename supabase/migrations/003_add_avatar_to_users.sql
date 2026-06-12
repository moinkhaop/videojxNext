-- 为 auth.users 表添加 avatar 字段
-- 注意：我们直接修改 auth.users 表，因为这是 Supabase 认证系统的表
-- 使用 raw_user_meta_data 字段存储头像信息

-- 创建一个函数来安全地更新用户头像
CREATE OR REPLACE FUNCTION update_user_avatar(user_uuid UUID, avatar_url TEXT)
RETURNS VOID AS $$
BEGIN
  -- 更新用户元数据中的头像URL
  UPDATE auth.users 
  SET raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'),
    '{avatar_url}',
    to_jsonb(avatar_url)
  )
  WHERE id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建一个函数来获取用户头像
CREATE OR REPLACE FUNCTION get_user_avatar(user_uuid UUID)
RETURNS TEXT AS $$
BEGIN
  RETURN (raw_user_meta_data->>'avatar_url') 
  FROM auth.users 
  WHERE id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 授权给认证用户使用这些函数
GRANT EXECUTE ON FUNCTION update_user_avatar TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_avatar TO authenticated;