import { PDFDocument, rgb, StandardFonts, PDFPage } from 'pdf-lib';

export type TemplateData = {
  tipoDocumento: 'proposta_comercial' | 'relatorio_final' | 'contrato' | 'orcamento';
  empresa: string;
  cliente?: string;
  dataInicio?: string;
  dataFim?: string;
  valor?: string;
  prazo?: string;
  responsavel?: string;
  observacoes?: string;
  itens?: Array<{ descricao: string; quantidade: number; valorUnitario: number }>;
};

export async function gerarPDFComTemplate(
  dados: TemplateData,
  logoBase64?: string
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]);
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = height - 50;

  // Logo (canto superior direito)
  if (logoBase64) {
    try {
      const logoBytes = Buffer.from(logoBase64.split(',')[1] || logoBase64, 'base64');
      const logoImage = await pdfDoc.embedPng(logoBytes);
      const logoDims = logoImage.scale(0.15);
      page.drawImage(logoImage, {
        x: width - 50 - logoDims.width,
        y: height - 50 - logoDims.height,
        width: logoDims.width,
        height: logoDims.height,
      });
    } catch (err) {
      console.error('Erro ao inserir logo:', err);
    }
  }

  // Título
  const tituloMap = {
    proposta_comercial: 'PROPOSTA COMERCIAL',
    relatorio_final: 'RELATÓRIO FINAL',
    contrato: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS',
    orcamento: 'ORÇAMENTO',
  };
  const titulo = tituloMap[dados.tipoDocumento] || 'DOCUMENTO';
  page.drawText(titulo, {
    x: 50,
    y,
    size: 20,
    font: fontBold,
    color: rgb(0, 0.2, 0.6),
  });
  y -= 40;

  // Linha
  page.drawLine({
    start: { x: 50, y },
    end: { x: width - 50, y },
    thickness: 1,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= 30;

  // Conteúdo dinâmico
  page.drawText(`Empresa: ${dados.empresa}`, { x: 50, y, size: 12, font });
  y -= 20;
  if (dados.cliente) {
    page.drawText(`Cliente: ${dados.cliente}`, { x: 50, y, size: 12, font });
    y -= 20;
  }
  if (dados.dataInicio) {
    page.drawText(`Data de início: ${dados.dataInicio}`, { x: 50, y, size: 12, font });
    y -= 20;
  }
  if (dados.dataFim) {
    page.drawText(`Data de conclusão: ${dados.dataFim}`, { x: 50, y, size: 12, font });
    y -= 20;
  }
  if (dados.valor) {
    page.drawText(`Valor total: R$ ${dados.valor}`, { x: 50, y, size: 12, font });
    y -= 20;
  }
  if (dados.prazo) {
    page.drawText(`Prazo: ${dados.prazo}`, { x: 50, y, size: 12, font });
    y -= 20;
  }
  if (dados.responsavel) {
    page.drawText(`Responsável: ${dados.responsavel}`, { x: 50, y, size: 12, font });
    y -= 20;
  }
  if (dados.itens && dados.itens.length > 0) {
    y -= 10;
    page.drawText(`Itens do orçamento:`, { x: 50, y, size: 12, font: fontBold });
    y -= 20;
    for (const item of dados.itens) {
      const linha = `${item.descricao} - ${item.quantidade} x R$ ${item.valorUnitario} = R$ ${(item.quantidade * item.valorUnitario).toFixed(2)}`;
      page.drawText(linha, { x: 60, y, size: 10, font });
      y -= 15;
      if (y < 50) break;
    }
    y -= 10;
  }
  if (dados.observacoes) {
    y -= 20;
    page.drawText(`Observações:`, { x: 50, y, size: 12, font: fontBold });
    y -= 18;
    page.drawText(dados.observacoes, { x: 50, y, size: 10, font, maxWidth: 500 });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}