/**
 * 清洗 LLM 输出中的内部标记。
 *
 * DeepSeek v4-pro reasoning 模型有时把 tool call 格式泄漏到 content 字段，
 * 使用 `<｜｜DSML｜｜>` 标签或其他内部标记。需要从最终答案中剥离。
 *
 * 常见模式：
 *   <｜｜DSML｜｜tool_calls>...</｜｜DSML｜｜tool_calls>
 *   <｜｜DSML｜｜invoke ...>...</｜｜DSML｜｜invoke>
 *   <｜｜'｜｜> / <｜begin'of'thought｜> 等推理残留标记
 *   <tool_call>...</tool_call>（部分模型兼容格式）
 */

/** 正则匹配所有已知的内部标记泄漏模式。 */
const DSML_PATTERNS = [
  // DeepSeek DSML tool call 标签
  /<｜｜DSML｜｜[\s\S]*?<\/｜｜DSML｜｜>/g,
  /<｜｜DSML｜｜[\s\S]*$/g, // 未闭合的（截断场景）
  // 其他 DeepSeek 内部标记
  /<｜[\s\S]*?｜>/g,
  // 通用 tool_call XML 标签
  /<tool_call>[\s\S]*?<\/tool_call>/g,
  /<tool_call>[\s\S]*$/g,
  // <function_calls> 格式
  /<function_calls>[\s\S]*?<\/function_calls>/g,
  // thinking/reasoning 残留
  /<thinking>[\s\S]*?<\/thinking>/g,
  /<reflection>[\s\S]*?<\/reflection>/g,
];

/**
 * 清洗 LLM 输出中的内部标记。
 * 用于：agent 最终答案、流式 delta、标题生成。
 */
export function sanitizeLLMOutput(text: string): string {
  if (!text) return text;
  let cleaned = text;
  for (const pattern of DSML_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  // 清理多余空行（标记被剥离后可能留下）
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  return cleaned;
}

/** 检查 content 是否包含泄漏的 tool call 标记（用于决定是否需要清洗）。 */
export function hasLeakedToolCalls(text: string): boolean {
  if (!text) return false;
  return /<｜｜DSML｜｜|<tool_call>|<function_calls>|<｜.*begin/.test(text);
}
