/**
 * ANSI颜色代码工具
 */

export const colors = {
  // 基础颜色
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  
  // 前景色
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  
  // 亮色
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  
  // 背景色
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

// 便捷函数
export const c = {
  // 成功信息（绿色）
  success: (text: string) => `${colors.brightGreen}${text}${colors.reset}`,
  
  // 错误信息（红色）
  error: (text: string) => `${colors.brightRed}${text}${colors.reset}`,
  
  // 警告信息（黄色）
  warn: (text: string) => `${colors.brightYellow}${text}${colors.reset}`,
  
  // 信息（蓝色）
  info: (text: string) => `${colors.brightBlue}${text}${colors.reset}`,
  
  // 调试信息（青色）
  debug: (text: string) => `${colors.cyan}${text}${colors.reset}`,
  
  // 标题（加粗白色）
  title: (text: string) => `${colors.bright}${colors.white}${text}${colors.reset}`,
  
  // 币种名称（洋红色）
  coin: (text: string) => `${colors.brightMagenta}${text}${colors.reset}`,
  
  // 价格（黄色）
  price: (text: string | number) => `${colors.yellow}${text}${colors.reset}`,
  
  // 百分比（青色）
  percent: (text: string | number) => `${colors.cyan}${text}${colors.reset}`,
  
  // 做多（绿色）
  long: (text: string) => `${colors.green}${text}${colors.reset}`,
  
  // 做空（红色）
  short: (text: string) => `${colors.red}${text}${colors.reset}`,
  
  // 灰色（次要信息）
  gray: (text: string) => `${colors.dim}${text}${colors.reset}`,
  
  // 分割线
  divider: (char: string = '=', length: number = 80) => 
    `${colors.dim}${char.repeat(length)}${colors.reset}`,
};

// 格式化数字
export const fmt = {
  // 格式化美元
  usd: (amount: number) => c.price(`$${amount.toFixed(2)}`),
  
  // 格式化百分比
  percent: (value: number) => c.percent(`${(value * 100).toFixed(2)}%`),
  
  // 格式化杠杆
  leverage: (value: number) => c.info(`${value}x`),
};
