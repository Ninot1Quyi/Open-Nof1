import type { NextApiRequest, NextApiResponse } from 'next'

// 实时价格始终使用官方 API
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const maxRetries = 3
  const retryDelay = 5000 // 5秒

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 实时价格数据始终从官方 API 获取
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10秒超时

      const response = await fetch('https://nof1.ai/api/crypto-prices', {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json',
        },
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      res.status(200).json(data)
      return
    } catch (error) {
      console.error(`[crypto-prices] Attempt ${attempt}/${maxRetries} failed:`, error)
      
      // 如果是最后一次尝试，返回错误
      if (attempt === maxRetries) {
        console.error('[crypto-prices] All retries failed, returning error')
        res.status(500).json({ 
          error: 'Failed to fetch crypto prices',
          prices: {}, // 返回空对象避免前端崩溃
          serverTime: Math.floor(Date.now() / 1000)
        })
        return
      }
      
      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, retryDelay))
    }
  }
}
