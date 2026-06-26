import { IconClose, IconCheck } from "../Icons.js";

/** 极简逐行 diff（LCS，无第三方库）。删除行红、新增行绿、上下行灰。
 *  仅用于"对话改笔记"后展示变更预览，用户确认/关闭。 */
interface DiffLine {
  type: "add" | "del" | "ctx";
  text: string;
}

function lineDiff(a: string[], b: string[]): DiffLine[] {
  const n = a.length, m = b.length;
  // dp[i][j] = a[i..] 与 b[j..] 的最长公共子序列长度
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: "ctx", text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: "del", text: a[i] }); i++; }
    else { out.push({ type: "add", text: b[j] }); j++; }
  }
  while (i < n) { out.push({ type: "del", text: a[i++] }); }
  while (j < m) { out.push({ type: "add", text: b[j++] }); }
  return out;
}

interface Props {
  before: string;
  after: string;
  title?: string;
  onAccept: () => void;
  onClose: () => void;
}

export function DiffView({ before, after, title, onAccept, onClose }: Props) {
  const diff = lineDiff(before.split("\n"), after.split("\n"));
  const added = diff.filter((d) => d.type === "add").length;
  const removed = diff.filter((d) => d.type === "del").length;

  return (
    <div className="diff-view">
      <div className="diff-header">
        <div className="row" style={{ gap: 8 }}>
          <strong>✏️ 笔记已更新</strong>
          <span className="diff-stat add">+{added}</span>
          <span className="diff-stat del">-{removed}</span>
          {title && <span className="muted" style={{ fontSize: 12 }}>{title}</span>}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn" style={{ padding: "4px 12px", fontSize: 13 }} onClick={onAccept}>
            <IconCheck size={13} /> 采纳
          </button>
          <button className="icon-btn" onClick={onClose}><IconClose size={16} /></button>
        </div>
      </div>
      <div className="diff-body">
        {diff.map((d, i) => (
          <div key={i} className={`diff-line ${d.type}`}>
            <span className="diff-sign">{d.type === "add" ? "+" : d.type === "del" ? "-" : " "}</span>
            <span className="diff-text">{d.text || " "}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
