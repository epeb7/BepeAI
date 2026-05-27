import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';

/**
 * Limpa valores brutos extraídos (remove frases indesejadas e formata)
 */
function limparValor(valor: string): string {
  if (!valor) return '___________';
  let limpo = valor
    .replace(/^(Não consegui encontrar informações sobre "|O valor bruto do campo .+ é:)/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();
  // Se ficou vazio, retorna placeholder
  return limpo || '___________';
}

/**
 * Gera PDF a partir de template com placeholders {{campo}}
 */
export async function gerarPDF(
  dados: Record<string, string>,
  tipoDocumento: string,
  logoBase64?: string
): Promise<Buffer> {
  // 1. Carregar template
  const templatePath = path.join(__dirname, '../templates', `${tipoDocumento}.txt`);
  let template: string;
  try {
    template = await fs.readFile(templatePath, 'utf-8');
    console.log(`[PDF] Template ${tipoDocumento}.txt carregado (${template.length} caracteres)`);
  } catch (err) {
    console.warn(`[PDF] Template ${tipoDocumento}.txt não encontrado, usando fallback`);
    template = Object.entries(dados).map(([k, v]) => `${k}: ${v}`).join('\n');
  }

  // 2. Sanitizar dados e substituir placeholders
  let conteudo = template;
  for (const [key, value] of Object.entries(dados)) {
    const placeholder = new RegExp(`{{${key}}}`, 'g');
    const valorLimpo = limparValor(value);
    conteudo = conteudo.replace(placeholder, valorLimpo);
  }

  // 3. Configurar documento (A4)
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const margin = { top: 70, bottom: 60, left: 50, right: 50 };
  let y = height - margin.top;
  const maxWidth = width - margin.left - margin.right;
  const lineHeight = 14;

  // Logo (opcional)
  if (logoBase64) {
    try {
      const base64Data = logoBase64.split(',')[1] || logoBase64;
      const logoBytes = Buffer.from(base64Data, 'base64');
      const logoImage = logoBase64.includes('image/png')
        ? await pdfDoc.embedPng(logoBytes)
        : await pdfDoc.embedJpg(logoBytes);
      const logoDims = logoImage.scale(0.12);
      page.drawImage(logoImage, {
        x: width - margin.right - logoDims.width,
        y: height - margin.top + 5,
        width: logoDims.width,
        height: logoDims.height,
      });
    } catch (err) {
      console.error('[PDF] Erro ao inserir logo:', err);
    }
  }

  // Título centralizado
  const titulo = tipoDocumento === 'contrato' ? 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS' : tipoDocumento.toUpperCase();
  const tituloWidth = fontBold.widthOfTextAtSize(titulo, 16);
  page.drawText(titulo, {
    x: (width - tituloWidth) / 2,
    y,
    size: 16,
    font: fontBold,
    color: rgb(0.1, 0.3, 0.6),
  });
  y -= 25;
  page.drawLine({
    start: { x: margin.left, y },
    end: { x: width - margin.right, y },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });
  y -= 15;

  // Função de desenho com quebra automática e criação de página
  const drawWrappedText = (text: string, x: number, y: number, size: number, font: any, isBold = false): number => {
    const usedFont = isBold ? fontBold : font;
    const words = text.split(' ');
    let line = '';
    let currentY = y;
    const effectiveLineHeight = size + 4;

    for (const word of words) {
      const testLine = line + (line ? ' ' : '') + word;
      const widthTest = usedFont.widthOfTextAtSize(testLine, size);
      if (widthTest <= maxWidth) {
        line = testLine;
      } else {
        page.drawText(line, { x, y: currentY, size, font: usedFont });
        currentY -= effectiveLineHeight;
        line = word;
        if (currentY < margin.bottom + 20) {
          page = pdfDoc.addPage([width, height]);
          currentY = height - margin.top;
        }
      }
    }
    if (line) {
      page.drawText(line, { x, y: currentY, size, font: usedFont });
      currentY -= effectiveLineHeight;
    }
    return currentY;
  };

  // Processar linhas do template
  const linhas = conteudo.split('\n');
  for (let linha of linhas) {
    linha = linha.trim();
    if (linha === '') {
      y -= 6;
      continue;
    }

    // Linha de assinatura: centralizar
    if (linha.includes('__________________________')) {
      const centerX = (width - font.widthOfTextAtSize(linha, 10)) / 2;
      page.drawText(linha, { x: centerX, y, size: 10, font: fontBold });
      y -= 20;
      continue;
    }

    // Negrito para cláusulas e cabeçalhos
    const isBold = linha.startsWith('Cláusula') || linha.includes('CONTRATANTE:') || linha.includes('CONTRATADO:') || (linha.length < 60 && linha === linha.toUpperCase());
    y = drawWrappedText(linha, margin.left, y, isBold ? 11 : 10, isBold ? fontBold : font, isBold);
    y -= 4;
    if (y < margin.bottom + 30) {
      page = pdfDoc.addPage([width, height]);
      y = height - margin.top;
    }
  }

  // Rodapé
  const rodapeY = margin.bottom - 15;
  page.drawLine({
    start: { x: margin.left, y: rodapeY + 8 },
    end: { x: width - margin.right, y: rodapeY + 8 },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  page.drawText(`BepeAI - Documento gerado em ${new Date().toLocaleDateString('pt-BR')}`, {
    x: margin.left,
    y: rodapeY,
    size: 8,
    font: fontOblique,
    color: rgb(0.5, 0.5, 0.5),
  });
  const pageCount = pdfDoc.getPages().length;
  page.drawText(`Página ${pageCount} de ${pageCount}`, {
    x: width - margin.right - 60,
    y: rodapeY,
    size: 8,
    font: fontOblique,
    color: rgb(0.5, 0.5, 0.5),
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}