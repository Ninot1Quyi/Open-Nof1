import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // 根据环境变量决定使用哪个后端
    const dataSource = process.env.NEXT_PUBLIC_DATA_SOURCE || 'official';
    const customApiUrl = process.env.NEXT_PUBLIC_CUSTOM_API_URL || 'http://localhost:3001';
    
    const apiUrl = dataSource === 'custom' 
      ? `${customApiUrl}/api/trades`
      : 'https://nof1.ai/api/trades';
    
    console.log(`[trades] Using ${dataSource} API: ${apiUrl}`);
    
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });
    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Trades API error:', error);
    res.status(500).json({ error: 'Failed to fetch trades', trades: [] });
  }
}
