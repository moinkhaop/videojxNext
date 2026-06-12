-- 创建用户配置表
CREATE TABLE IF NOT EXISTS user_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  config_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建历史记录表
CREATE TABLE IF NOT EXISTS history_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  record_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建标签表
CREATE TABLE IF NOT EXISTS tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tag_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建清理配置表
CREATE TABLE IF NOT EXISTS cleanup_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  config_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 启用行级安全策略 (RLS)
ALTER TABLE user_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE history_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleanup_configs ENABLE ROW LEVEL SECURITY;

-- 用户配置表的 RLS 策略
CREATE POLICY "Users can view own user_configs" ON user_configs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own user_configs" ON user_configs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own user_configs" ON user_configs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own user_configs" ON user_configs FOR DELETE USING (auth.uid() = user_id);

-- 历史记录表的 RLS 策略
CREATE POLICY "Users can view own history_records" ON history_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own history_records" ON history_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own history_records" ON history_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own history_records" ON history_records FOR DELETE USING (auth.uid() = user_id);

-- 标签表的 RLS 策略
CREATE POLICY "Users can view own tags" ON tags FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tags" ON tags FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tags" ON tags FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tags" ON tags FOR DELETE USING (auth.uid() = user_id);

-- 清理配置表的 RLS 策略
CREATE POLICY "Users can view own cleanup_configs" ON cleanup_configs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own cleanup_configs" ON cleanup_configs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own cleanup_configs" ON cleanup_configs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own cleanup_configs" ON cleanup_configs FOR DELETE USING (auth.uid() = user_id);

-- 创建更新时间戳的函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为所有表创建更新时间戳的触发器
CREATE TRIGGER update_user_configs_updated_at BEFORE UPDATE ON user_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_history_records_updated_at BEFORE UPDATE ON history_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tags_updated_at BEFORE UPDATE ON tags FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cleanup_configs_updated_at BEFORE UPDATE ON cleanup_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_user_configs_user_id ON user_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_history_records_user_id ON history_records(user_id);
CREATE INDEX IF NOT EXISTS idx_history_records_created_at ON history_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
CREATE INDEX IF NOT EXISTS idx_cleanup_configs_user_id ON cleanup_configs(user_id);