declare module "pdf-parse" {
  const pdfParse: (data: string | Buffer | Uint8Array) => Promise<{
    text: string;
    numpages?: number;
    npages?: number;
    info?: Record<string, unknown>;
  }>;
  export default pdfParse;
}

declare module "pptxtojson" {
  const pptx2json: (input: Buffer | ArrayBuffer | Uint8Array) => Promise<any>;
  export default pptx2json;
}

declare module "epub2" {
  export default class EPub {
    constructor(path: string);
    flow: any[];
    on(event: "end" | "error", cb: (...args: any[]) => void): void;
    getChapter(id: string, cb: (err: Error | null, html?: string) => void): void;
    parse(): void;
  }
}
