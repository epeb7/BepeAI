declare module 'fontkit' {
  interface Font {
    layout(str: string): any;
    getGlyph(glyphId: number): any;
    getPath(glyphId: number, x: number, y: number): any;
    // Adicione outras funções conforme necessário
    [key: string]: any;
  }
  const fontkit: {
    openSync(filename: string): Font;
    open(filename: string): Promise<Font>;
    create(): any;
  };
  export = fontkit;
}
