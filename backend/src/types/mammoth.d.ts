// Type shim mínimo para mammoth (não publica @types).
declare module 'mammoth' {
  interface ExtractResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  interface Input {
    buffer?: Buffer;
    path?: string;
  }
  export function extractRawText(input: Input): Promise<ExtractResult>;
  export function convertToHtml(input: Input): Promise<ExtractResult>;
}
