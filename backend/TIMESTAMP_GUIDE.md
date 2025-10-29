# 时间戳使用指南

## 概述

系统中所有数据都包含时间戳信息，确保数据的可追溯性和时序性。

## 时间戳类型

### 1. **Unix时间戳（秒）** - `timestamp` / `inserted_at` / `entry_time` / `exit_time`

**格式**: 整数，表示自1970年1月1日以来的秒数

**用途**: 
- 用于时间计算和排序
- 跨时区统一
- 数据库索引优化

**示例**: `1704067200` (2024-01-01 00:00:00 UTC)

### 2. **ISO时间戳** - `created_at` / `entry_human_time` / `exit_human_time`

**格式**: ISO 8601格式字符串

**用途**:
- 人类可读
- 包含时区信息
- 前端直接显示

**示例**: `2024-01-01T00:00:00.000Z`

## 数据库表时间戳

### account_snapshots - 账户快照表

| 字段 | 类型 | 说明 |
|------|------|------|
| `timestamp` | BIGINT | 快照时间（Unix秒） |
| `created_at` | TIMESTAMP | 数据库插入时间（ISO） |

**用途**:
- `timestamp`: 用于图表X轴，时间序列分析
- `created_at`: 用于审计，数据追踪

### positions - 仓位表

| 字段 | 类型 | 说明 |
|------|------|------|
| `timestamp` | BIGINT | 仓位快照时间（Unix秒） |
| `created_at` | TIMESTAMP | 数据库插入时间（ISO） |

**用途**:
- `timestamp`: 仓位时间点，与账户快照对应
- `created_at`: 数据入库时间

### completed_trades - 已完成交易表

| 字段 | 类型 | 说明 |
|------|------|------|
| `entry_time` | BIGINT | 入场时间（Unix秒） |
| `exit_time` | BIGINT | 出场时间（Unix秒） |
| `entry_human_time` | TIMESTAMP | 入场时间（ISO） |
| `exit_human_time` | TIMESTAMP | 出场时间（ISO） |
| `created_at` | TIMESTAMP | 数据库插入时间（ISO） |

**用途**:
- `entry_time` / `exit_time`: 用于计算持仓时长，排序
- `entry_human_time` / `exit_human_time`: 前端显示
- `created_at`: 数据同步时间

### agent_conversations - Agent对话记录表

| 字段 | 类型 | 说明 |
|------|------|------|
| `inserted_at` | BIGINT | 对话时间（Unix秒） |
| `created_at` | TIMESTAMP | 数据库插入时间（ISO） |

**用途**:
- `inserted_at`: 对话发生时间，用于排序
- `created_at`: 数据入库时间

## API返回的时间戳

### GET /api/account-history

```json
{
  "accountTotals": [
    {
      "model_id": "gpt-5",
      "dollar_equity": 10500.50,
      "total_unrealized_pnl": 500.50,
      "timestamp": 1704067200,           // Unix秒
      "created_at": "2024-01-01T00:00:00.000Z"  // ISO格式
    }
  ]
}
```

### GET /api/account-totals

```json
{
  "accountTotals": [
    {
      "id": "gpt-5_1704067200",
      "model_id": "gpt-5",
      "dollar_equity": 10500.50,
      "total_unrealized_pnl": 500.50,
      "timestamp": 1704067200,           // 快照时间（Unix秒）
      "created_at": "2024-01-01T00:00:00.000Z",  // 数据库时间（ISO）
      "positions": {
        "BTC": {
          "symbol": "BTC",
          "entry_price": 100000,
          "current_price": 101000,
          "timestamp": 1704067200,       // 仓位时间（Unix秒）
          "created_at": "2024-01-01T00:00:00.000Z"  // 数据库时间（ISO）
        }
      }
    }
  ],
  "serverTime": 1704067200  // 服务器当前时间（Unix秒）
}
```

### GET /api/trades

```json
{
  "trades": [
    {
      "id": "trade-uuid",
      "symbol": "BTC",
      "model_id": "gpt-5",
      "entry_time": 1704067200,          // 入场时间（Unix秒）
      "exit_time": 1704070800,           // 出场时间（Unix秒）
      "entry_human_time": "2024-01-01T00:00:00.000Z",  // 入场时间（ISO）
      "exit_human_time": "2024-01-01T01:00:00.000Z",   // 出场时间（ISO）
      "created_at": "2024-01-01T01:05:00.000Z"  // 数据同步时间（ISO）
    }
  ]
}
```

### GET /api/conversations

```json
{
  "conversations": [
    {
      "id": "gpt-5_1",
      "model_id": "gpt-5",
      "cycle_id": 1,
      "inserted_at": 1704067200,         // 对话时间（Unix秒）
      "created_at": "2024-01-01T00:00:00.000Z",  // 数据库时间（ISO）
      "user_prompt": "...",
      "llm_response": {...}
    }
  ]
}
```

## 前端使用示例

### 1. 显示人类可读时间

```typescript
// 使用 ISO 格式
const displayTime = new Date(trade.exit_human_time).toLocaleString('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
});
// 输出: "2024/01/01 00:00:00"
```

### 2. 计算时间差

```typescript
// 使用 Unix 时间戳（秒）
const holdingTimeSeconds = trade.exit_time - trade.entry_time;
const hours = Math.floor(holdingTimeSeconds / 3600);
const minutes = Math.floor((holdingTimeSeconds % 3600) / 60);
console.log(`持仓时长: ${hours}小时 ${minutes}分钟`);
```

### 3. 图表X轴

```typescript
// 使用 Unix 时间戳（秒），转换为毫秒
const chartData = accountTotals.map(snapshot => ({
  x: snapshot.timestamp * 1000,  // 转换为毫秒
  y: snapshot.dollar_equity
}));
```

### 4. 排序

```typescript
// 按时间降序排序（最新的在前）
const sorted = conversations.sort((a, b) => b.inserted_at - a.inserted_at);
```

### 5. 时间范围过滤

```typescript
// 获取最近24小时的数据
const now = Math.floor(Date.now() / 1000);  // 当前时间（Unix秒）
const oneDayAgo = now - 86400;  // 24小时前

const recentData = snapshots.filter(s => s.timestamp >= oneDayAgo);
```

## 时区处理

### 数据库存储

- **Unix时间戳**: 无时区概念，全球统一
- **TIMESTAMP**: PostgreSQL默认使用UTC时区

### API返回

- **Unix时间戳**: 直接返回，无时区转换
- **ISO格式**: 包含时区信息（通常为UTC，以Z结尾）

### 前端显示

```typescript
// 自动转换为用户本地时区
const localTime = new Date(snapshot.created_at).toLocaleString();

// 或者明确指定时区
const bjTime = new Date(snapshot.created_at).toLocaleString('zh-CN', {
  timeZone: 'Asia/Shanghai'
});
```

## 最佳实践

### 1. 存储时使用Unix时间戳

```typescript
// ✅ 推荐
const timestamp = Math.floor(Date.now() / 1000);

// ❌ 避免
const timestamp = new Date().toISOString();
```

### 2. 显示时使用ISO格式

```typescript
// ✅ 推荐 - 前端显示
<div>{new Date(trade.exit_human_time).toLocaleString()}</div>

// ✅ 推荐 - 计算时长
const duration = trade.exit_time - trade.entry_time;
```

### 3. 数据库查询优化

```sql
-- ✅ 推荐 - 使用索引的Unix时间戳
SELECT * FROM account_snapshots 
WHERE timestamp > 1704067200 
ORDER BY timestamp DESC;

-- ❌ 避免 - 对ISO时间戳进行计算
SELECT * FROM account_snapshots 
WHERE created_at > NOW() - INTERVAL '1 day';
```

### 4. API设计

```typescript
// ✅ 推荐 - 同时返回两种格式
{
  "timestamp": 1704067200,           // 用于计算
  "created_at": "2024-01-01T00:00:00.000Z"  // 用于显示
}

// ❌ 避免 - 只返回一种
{
  "time": "2024-01-01T00:00:00.000Z"
}
```

## 常见问题

### Q1: 为什么要同时存储两种时间戳？

**A**: 
- **Unix时间戳**: 计算快速，索引高效，跨时区统一
- **ISO格式**: 人类可读，调试方便，包含时区信息

### Q2: `timestamp` 和 `created_at` 有什么区别？

**A**:
- `timestamp`: 数据的**业务时间**（如快照时间、交易时间）
- `created_at`: 数据的**入库时间**（数据库自动生成）

通常 `timestamp` ≈ `created_at`，但在数据同步场景下可能有延迟。

### Q3: 前端如何处理时区？

**A**:
```typescript
// 方法1: 使用浏览器本地时区（推荐）
const local = new Date(timestamp * 1000).toLocaleString();

// 方法2: 明确指定时区
const beijing = new Date(timestamp * 1000).toLocaleString('zh-CN', {
  timeZone: 'Asia/Shanghai'
});

// 方法3: 使用库（如 date-fns, moment.js）
import { format } from 'date-fns';
const formatted = format(new Date(timestamp * 1000), 'yyyy-MM-dd HH:mm:ss');
```

### Q4: 如何确保时间戳的一致性？

**A**:
1. **服务器端生成**: 所有时间戳在服务器端生成，避免客户端时间不准
2. **使用UTC**: 数据库和API统一使用UTC时区
3. **Unix时间戳**: 用于计算和存储，避免时区问题

## 总结

✅ **所有数据都有时间戳**
- 账户快照: `timestamp` + `created_at`
- 仓位: `timestamp` + `created_at`
- 交易: `entry_time` + `exit_time` + `entry_human_time` + `exit_human_time` + `created_at`
- 对话: `inserted_at` + `created_at`

✅ **双时间戳设计**
- Unix时间戳（秒）: 用于计算、排序、索引
- ISO格式: 用于显示、调试、审计

✅ **时区统一**
- 数据库: UTC
- API: UTC
- 前端: 自动转换为本地时区
