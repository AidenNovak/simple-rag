import { config } from "../config/index.js";
import { logger } from "../config/logger.js";
import { withRetry } from "../config/retry.js";

/**
 * Embedding 调用：走智谱 embedding-3（1024 维）。
 * 系统级资源，不走用户 key。
 *
 * 注意：智谱 OpenAI 兼容端点经 SDK 传 dimensions 时行为异常（返回 256 维），
 * 故这里用裸 fetch 直调智谱 /embeddings，显式带 dimensions。实测稳定返回 1024 维。
 *
 * Mock 模式（EMBEDDING_MODEL=mock）：用确定性哈希生成向量，仅用于本地测试。
 */
function mockEmbed(text: string, dim = 1024): number[] {
  const vec = new Array(dim).fill(0);
  const tokens = text.toLowerCase().split(/[\s,。！？!?.；;\n，、（）()"'`]+/).filter(Boolean);
  for (const tok of tokens) {
    let h = 0;
    for (let i = 0; i < tok.length; i++) h = (h * 31 + tok.charCodeAt(i)) >>> 0;
    vec[h % dim] += 1;
  }
  let norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (norm === 0) norm = 1;
  return vec.map((v) => v / norm);
}

const BATCH = 16;

export interface EmbedResult {
  vectors: number[][];
  usage: { promptTokens: number; totalTokens: number };
}

async function zhipuEmbed(texts: string[]): Promise<EmbedResult> {
  const url = `${config.embeddingBaseUrl.replace(/\/$/, "")}/embeddings`;
  const vectors: number[][] = [];
  let promptTokens = 0;
  let totalTokens = 0;

  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const data: any = await withRetry(async () => {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.embeddingApiKey}`,
        },
        body: JSON.stringify({
          model: config.embeddingModel,
          input: slice,
          dimensions: config.embeddingDim,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        const err = new Error(`[embed] zhipu HTTP ${resp.status}: ${txt.slice(0, 200)}`);
        (err as any).status = resp.status;
        throw err;
      }
      return resp.json();
    }, { label: "zhipu-embed" });

    const arr: any[] = data.data || [];
    for (const d of arr) vectors[i + d.index] = d.embedding;
    if (data.usage) {
      promptTokens += data.usage.prompt_tokens || 0;
      totalTokens += data.usage.total_tokens || 0;
    }
  }
  logger.debug({ model: config.embeddingModel, count: texts.length }, "embedded");
  return { vectors, usage: { promptTokens, totalTokens } };
}

export async function embedTexts(texts: string[]): Promise<EmbedResult> {
  if (config.embeddingModel === "mock") {
    return { vectors: texts.map((t) => mockEmbed(t, config.embeddingDim)), usage: { promptTokens: 0, totalTokens: 0 } };
  }
  return zhipuEmbed(texts);
}

export async function embedOne(text: string): Promise<number[]> {
  const { vectors } = await embedTexts([text]);
  return vectors[0];
}
