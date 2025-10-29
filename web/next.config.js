const path = require('path');
const { config } = require('dotenv');

// 加载项目根目录的 .env 文件
config({ path: path.resolve(__dirname, '../.env') });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  async rewrites() {
    return [
      {
        source: '/api/nof1/:path*',
        destination: 'https://nof1.ai/api/:path*',
      },
    ]
  },
  // 将根目录 .env 中的 NEXT_PUBLIC_* 变量传递给前端
  env: {
    NEXT_PUBLIC_DATA_SOURCE: process.env.NEXT_PUBLIC_DATA_SOURCE,
    NEXT_PUBLIC_CUSTOM_API_URL: process.env.NEXT_PUBLIC_CUSTOM_API_URL,
    NEXT_PUBLIC_OFFICIAL_API_URL: process.env.NEXT_PUBLIC_OFFICIAL_API_URL,
  },
}

module.exports = nextConfig
