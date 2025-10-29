/**
 * API 配置
 * 根据环境变量决定使用官方 API 还是自定义后端
 */

export const API_CONFIG = {
  // 数据源: 'official' 或 'custom'
  dataSource: (process.env.NEXT_PUBLIC_DATA_SOURCE || 'official') as 'official' | 'custom',
  
  // 自定义后端地址
  customApiUrl: process.env.NEXT_PUBLIC_CUSTOM_API_URL || 'http://localhost:3001',
  
  // 官方 API 地址
  officialApiUrl: process.env.NEXT_PUBLIC_OFFICIAL_API_URL || 'https://nof1.ai',
};

/**
 * 获取 API 端点
 * @param endpoint API 端点路径（如 '/api/account-history'）
 * @param forceOfficial 是否强制使用官方 API（如实时价格）
 */
export function getApiUrl(endpoint: string, forceOfficial: boolean = false): string {
  const useOfficial = forceOfficial || API_CONFIG.dataSource === 'official';
  const baseUrl = useOfficial ? API_CONFIG.officialApiUrl : API_CONFIG.customApiUrl;
  
  return `${baseUrl}${endpoint}`;
}

/**
 * 获取当前数据源名称
 */
export function getDataSourceName(): string {
  return API_CONFIG.dataSource === 'official' ? '官方数据' : '自定义后端';
}
