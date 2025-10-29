# Alpha Arena - Next.js Version

基于原始下载的静态HTML恢复的完整Next.js项目。

## 项目结构

```
alpha-arena-nextjs/
├── pages/              # Next.js页面
│   ├── _app.tsx       # App组件
│   ├── index.tsx      # 首页
│   ├── leaderboard.tsx # 排行榜
│   ├── blog.tsx       # 博客
│   └── waitlist.tsx   # 等待列表
├── public/            # 静态资源
│   ├── logos/         # Logo图片
│   ├── coins/         # 币种图标
│   └── blogPosts/     # 博客图片
├── styles/            # 样式文件
│   └── globals.css    # 全局样式
├── components/        # React组件（待添加）
├── lib/              # 工具函数（待添加）
├── next.config.js    # Next.js配置
├── tailwind.config.js # Tailwind配置
└── tsconfig.json     # TypeScript配置
```

## 启动项目

### 开发模式
```bash
npm run dev
```
访问 http://localhost:3000

### 构建生产版本
```bash
npm run build
npm start
```

### 导出静态HTML
```bash
npm run export
```
导出的文件在 `out/` 目录

## 功能特性

✅ Next.js 14 + TypeScript
✅ Tailwind CSS
✅ 客户端路由（Link组件）
✅ 所有页面正常跳转
✅ 静态资源已迁移
✅ 支持静态导出

## 下一步工作

1. 从原始HTML提取完整的页面内容和样式
2. 创建可复用的React组件
3. 集成后端API（http://localhost:3001）
4. 添加数据获取逻辑
5. 实现实时数据更新

## 与后端集成

后端API运行在 http://localhost:3001

在 `lib/api.ts` 中创建API客户端，然后在页面中使用。
