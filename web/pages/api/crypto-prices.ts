import type { NextApiRequest, NextApiResponse } from 'next'

const DATA_SOURCE = process.env.NEXT_PUBLIC_DATA_SOURCE || 'custom'
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const maxRetries = 3
  const retryDelay = 5000 // 5秒

  // 根据数据源选择 API
  const apiUrl = DATA_SOURCE === 'official' 
    ? 'https://nof1.ai/api/crypto-prices'
    : `${BACKEND_URL}/api/crypto-prices`

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10秒超时

      const response = await fetch(apiUrl, {
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
