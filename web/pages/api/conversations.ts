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
      ? `${customApiUrl}/api/conversations`
      : 'https://nof1.ai/api/conversations';
    
    console.log(`[conversations] Using ${dataSource} API: ${apiUrl}`);
    
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
}
