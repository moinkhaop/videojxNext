// TODO: 暂时注释 Supabase 数据库功能。
// 说明：这些函数保留导出以避免编译错误；当前会直接报"功能禁用"。

const disabled = (): never => {
  throw new Error('Supabase 功能已暂时禁用，请稍后再试')
}

// 用户配置相关
export async function getUserConfig(): Promise<any> {
  return disabled()
}

export async function updateUserConfig(_configData: any): Promise<any> {
  return disabled()
}

// 历史记录相关
export async function getHistoryRecords(_limit = 100, _offset = 0): Promise<any[]> {
  return disabled()
}

export async function addHistoryRecord(_recordData: any): Promise<void> {
  return disabled()
}

export async function updateHistoryRecord(_id: string, _updates: any): Promise<void> {
  return disabled()
}

export async function deleteHistoryRecord(_id: string): Promise<void> {
  return disabled()
}

// 标签相关
export async function getTags(): Promise<any[]> {
  return disabled()
}

export async function addTag(_tagData: any): Promise<any> {
  return disabled()
}

export async function updateTag(_id: string, _updates: any): Promise<void> {
  return disabled()
}

export async function deleteTag(_id: string): Promise<void> {
  return disabled()
}

// 清理配置相关
export async function getCleanupConfig(): Promise<any> {
  return disabled()
}

export async function updateCleanupConfig(_configData: any): Promise<void> {
  return disabled()
}

