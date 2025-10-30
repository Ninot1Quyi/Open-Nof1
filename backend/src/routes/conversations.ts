/**
 * API路由: GET /api/conversations
 * 返回Agent的对话记录
 */

import { Router, Request, Response } from 'express';
import * as db from '../database/db.js';

const router = Router();

router.get('/conversations', async (req: Request, res: Response) => {
  try {
    // 获取所有对话记录，限制返回最近100条
    const conversations = await db.getAllConversations(100);

    // 转换为前端需要的格式
    const formattedConversations = conversations.map(conv => {
      // 解析 llm_response
      let llmResponse = conv.llm_response;
      if (typeof llmResponse === 'string') {
        try {
          llmResponse = JSON.parse(llmResponse);
        } catch (e) {
          console.error('[API] Failed to parse llm_response:', e);
        }
      }

      // 处理 cot_trace
      let cotTrace = conv.cot_trace;
      if (cotTrace) {
        // 如果是字符串类型的 JSON，尝试解析
        if (typeof cotTrace === 'string') {
          try {
            // 尝试解析 JSON 字符串（新格式：直接存储 reasoning 文本）
            const parsed = JSON.parse(cotTrace);
            cotTrace = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
          } catch (e) {
            // 如果解析失败，说明已经是纯文本，直接使用
            // 这种情况不应该发生，因为数据库字段是 jsonb
          }
        } else if (typeof cotTrace === 'object') {
          // 如果是对象，提取 raw_response（旧格式）
          if (cotTrace.raw_response) {
            cotTrace = cotTrace.raw_response;
          } else {
            cotTrace = JSON.stringify(cotTrace, null, 2);
          }
        }
      }

      // 转换 llm_response 为前端期望的格式
      // 数据库格式: { "BTC": { "trade_signal_args": {...}, "justification": "..." } }
      // 前端期望: { "BTC": { "coin": "BTC", "signal": "...", "confidence": ..., ... } }
      const tradingDecisions: any = {};
      if (llmResponse && typeof llmResponse === 'object') {
        for (const [symbol, data] of Object.entries(llmResponse)) {
          const tradeData = data as any;
          if (tradeData.trade_signal_args) {
            tradingDecisions[symbol] = {
              coin: tradeData.trade_signal_args.coin || symbol,
              signal: tradeData.trade_signal_args.signal || 'hold',
              confidence: tradeData.trade_signal_args.confidence || 0,
              quantity: tradeData.trade_signal_args.quantity || 0,
              leverage: tradeData.trade_signal_args.leverage || 0,
              risk_usd: tradeData.trade_signal_args.risk_usd || 0,
              stop_loss: tradeData.trade_signal_args.stop_loss || 0,
              profit_target: tradeData.trade_signal_args.profit_target || 0,
              invalidation_condition: tradeData.trade_signal_args.invalidation_condition || '',
              justification: tradeData.justification || ''
            };
          }
        }
      }

      return {
        id: conv.id,
        model_id: conv.model_id,
        user_prompt: conv.user_prompt,
        llm_response: tradingDecisions,  // 使用转换后的格式
        cycle_id: conv.cycle_id,
        inserted_at: parseInt(conv.inserted_at),
        created_at: conv.created_at,
        cot_trace: cotTrace,  // Markdown 字符串
        cot_trace_summary: conv.cot_trace_summary,
        trading_decisions: tradingDecisions  // 同样的数据
      };
    });

    res.json({
      conversations: formattedConversations,
      count: formattedConversations.length
    });
  } catch (error) {
    console.error('[API] Error in /api/conversations:', error);
    res.status(500).json({
      error: 'Failed to fetch conversations',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
