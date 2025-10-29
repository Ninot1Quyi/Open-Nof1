import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // 添加超时控制
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10秒超时

    // 直接使用带参数的 API 获取最新数据（marker 273）
    // 根据环境变量决定使用哪个后端
    const dataSource = process.env.NEXT_PUBLIC_DATA_SOURCE || 'official';
    const customApiUrl = process.env.NEXT_PUBLIC_CUSTOM_API_URL || 'http://localhost:3001';
    
    const apiUrl = dataSource === 'custom' 
      ? `${customApiUrl}/api/account-totals`
      : 'https://nof1.ai/api/account-totals?lastHourlyMarker=273';
    
    console.log(`[account-totals] Using ${dataSource} API: ${apiUrl}`);
    
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      signal: controller.signal,
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    console.log('✓ Account totals fetched successfully:', Array.isArray(data) ? data.length : 'not array')
    res.status(200).json(data)
  } catch (error) {
    console.error('✗ Account totals API error:', error)
    // 返回空数组而不是错误，让前端能正常显示
    res.status(200).json([])
  }
}
