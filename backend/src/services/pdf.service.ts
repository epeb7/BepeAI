/**
 * PDF Generation Engine — BepeAI Professional Layout.
 *
 * Padrão jurídico brasileiro:
 *  - Texto justificado (distribuição de espaço entre palavras)
 *  - Alíneas a) b) c) com recuo
 *  - Parágrafos únicos (§) com recuo
 *  - Bloco de assinatura completo: linha + nome + CPF + data
 *  - Header BepeAI sem repetição do título no corpo
 *  - Numeração de página e rodapé institucional
 */

import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont, RGB } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import logger from '../lib/logger';

// ── Paleta BepeAI ─────────────────────────────────────────────
const BRAND_BLUE  = rgb(0.071, 0.149, 0.388);
const BRAND_LIGHT = rgb(0.353, 0.239, 0.961);
const GRAY_DARK   = rgb(0.10, 0.10, 0.10);
const GRAY_MID    = rgb(0.42, 0.42, 0.42);
const GRAY_LIGHT  = rgb(0.72, 0.72, 0.72);
const WHITE       = rgb(1, 1, 1);

// ── Cache de templates ────────────────────────────────────────
const templateCache = new Map<string, string>();

async function carregarTemplate(tipo: string): Promise<string> {
  if (templateCache.has(tipo)) return templateCache.get(tipo)!;
  const templatePath = path.join(__dirname, '../templates', `${tipo}.txt`);
  try {
    const conteudo = await fs.readFile(templatePath, 'utf-8');
    templateCache.set(tipo, conteudo);
    return conteudo;
  } catch {
    const fallback = '(Documento gerado automaticamente)\n\n{{_dados_}}';
    templateCache.set(tipo, fallback);
    return fallback;
  }
}

// ── Formatação de valores ─────────────────────────────────────
function limparValor(valor: string | undefined): string {
  if (!valor?.trim()) return '___________';
  return valor.replace(/^["']|["']$/g, '').replace(/^(Não consegui|Não foi)/i, '').trim() || '___________';
}

function formatarCNPJ(v: string): string {
  const d = v.replace(/\D/g, '');
  return d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : v;
}

function formatarCPF(v: string): string {
  const d = v.replace(/\D/g, '');
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : v;
}

function formatarMoeda(v: string): string {
  const num = parseFloat(v.replace(',', '.'));
  if (isNaN(num)) return v;
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Converte número para extenso (simplificado para valores contratuais comuns)
function valorParaExtenso(v: string): string {
  const num = parseFloat(v.replace(',', '.'));
  if (isNaN(num) || num <= 0) return v;

  const inteiro = Math.floor(num);
  const centavos = Math.round((num - inteiro) * 100);

  const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
    'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const centenas = ['', 'cem', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
    'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

  function grupo(n: number): string {
    if (n === 0) return '';
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100);
    const d = Math.floor((n % 100) / 10);
    const u = n % 10;
    const resto = n % 100;
    let r = '';
    if (c) r += centenas[c];
    if (c && resto) r += ' e ';
    if (resto < 20) r += unidades[resto];
    else { r += dezenas[d]; if (u) r += ' e ' + unidades[u]; }
    return r;
  }

  let resultado = '';
  if (inteiro >= 1_000_000) {
    const m = Math.floor(inteiro / 1_000_000);
    resultado += grupo(m) + (m === 1 ? ' milhão' : ' milhões');
    if (inteiro % 1_000_000) resultado += ' e ';
  }
  if (inteiro >= 1_000 && inteiro < 1_000_000) {
    const mil = Math.floor(inteiro / 1_000);
    resultado += (mil === 1 ? 'mil' : grupo(mil) + ' mil');
    if (inteiro % 1_000) resultado += ' e ';
  }
  const resto = inteiro % 1_000;
  if (resto) resultado += grupo(resto);

  resultado += inteiro === 1 ? ' real' : ' reais';
  if (centavos) resultado += ' e ' + grupo(centavos) + (centavos === 1 ? ' centavo' : ' centavos');

  return resultado.charAt(0).toUpperCase() + resultado.slice(1);
}

function numeroPorExtenso(v: string): string {
  const n = parseInt(v, 10);
  if (isNaN(n)) return v;
  const ext: Record<number, string> = {
    1: 'um', 2: 'dois', 3: 'três', 5: 'cinco', 7: 'sete', 10: 'dez',
    15: 'quinze', 30: 'trinta', 45: 'quarenta e cinco', 60: 'sessenta', 90: 'noventa',
  };
  return ext[n] ?? String(n);
}

function formatarCampo(key: string, valor: string): string {
  const limpo = limparValor(valor);
  if (limpo === '___________') return limpo;
  if (key.includes('cnpj'))            return formatarCNPJ(limpo);
  if (key.includes('cpf'))             return formatarCPF(limpo);
  if (key === 'valor_total' || key === 'valor' || key === 'valor_unitario' || key === 'penalidade_valor') return formatarMoeda(limpo);
  return limpo;
}

// ── Títulos ───────────────────────────────────────────────────
const TITULOS: Record<string, string> = {
  contrato:           'CONTRATO DE PRESTAÇÃO DE SERVIÇOS',
  proposta_comercial: 'PROPOSTA COMERCIAL',
  relatorio_final:    'RELATÓRIO FINAL',
  orcamento:          'ORÇAMENTO',
  nda:                'ACORDO DE CONFIDENCIALIDADE (NDA)',
};

// ── Contexto de renderização ──────────────────────────────────
interface RenderCtx {
  pdfDoc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  fontBold: PDFFont;
  fontOblique: PDFFont;
  margin: { top: number; bottom: number; left: number; right: number };
  pageWidth: number;
  pageHeight: number;
  maxWidth: number;
}

function newPage(ctx: RenderCtx): void {
  ctx.page = ctx.pdfDoc.addPage([ctx.pageWidth, ctx.pageHeight]);
  ctx.y = ctx.pageHeight - ctx.margin.top;
}

function ensureSpace(ctx: RenderCtx, needed: number): void {
  if (ctx.y < ctx.margin.bottom + needed) newPage(ctx);
}

// ── Justificação de texto ─────────────────────────────────────
// Distribui espaço extra entre palavras para alinhar à direita também.
function drawJustifiedLine(
  ctx: RenderCtx,
  words: string[],
  isLastLine: boolean,
  x: number,
  usableW: number,
  size: number,
  font: PDFFont,
  color: RGB,
): void {
  if (words.length === 0) return;
  if (isLastLine || words.length === 1) {
    // Última linha ou linha única: alinha à esquerda
    ctx.page.drawText(words.join(' '), { x, y: ctx.y, size, font, color });
    return;
  }
  const totalTextW = words.reduce((acc, w) => acc + font.widthOfTextAtSize(w, size), 0);
  const gaps = words.length - 1;
  const spaceW = (usableW - totalTextW) / gaps;
  let cx = x;
  for (let i = 0; i < words.length; i++) {
    ctx.page.drawText(words[i], { x: cx, y: ctx.y, size, font, color });
    cx += font.widthOfTextAtSize(words[i], size) + (i < words.length - 1 ? spaceW : 0);
  }
}

// ── Quebra e renderiza parágrafo com justificação ─────────────
function drawParagraph(
  ctx: RenderCtx,
  text: string,
  opts: {
    size?: number;
    bold?: boolean;
    italic?: boolean;
    color?: RGB;
    indent?: number;          // recuo na primeira linha
    hangingIndent?: number;   // recuo em todas as linhas exceto a primeira (alíneas)
    lineGap?: number;
    justify?: boolean;
    afterGap?: number;        // espaço após o parágrafo
  } = {}
): void {
  const {
    size = 10,
    bold = false,
    italic = false,
    color = GRAY_DARK,
    indent = 0,
    hangingIndent = 0,
    lineGap = 4.5,
    justify = true,
    afterGap = 6,
  } = opts;

  const usedFont = bold ? ctx.fontBold : italic ? ctx.fontOblique : ctx.font;
  const baseX = ctx.margin.left + hangingIndent;
  const usableW = ctx.maxWidth - hangingIndent;

  // Quebra em linhas respeitando largura
  const allWords = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[][] = [];
  let currentLine: string[] = [];

  // Primeira linha pode ter indent adicional
  const firstLineW = usableW - indent;

  for (const word of allWords) {
    const testLine = [...currentLine, word];
    const maxW = lines.length === 0 ? firstLineW : usableW;
    if (usedFont.widthOfTextAtSize(testLine.join(' '), size) <= maxW) {
      currentLine.push(word);
    } else {
      if (currentLine.length) lines.push(currentLine);
      currentLine = [word];
    }
  }
  if (currentLine.length) lines.push(currentLine);

  for (let i = 0; i < lines.length; i++) {
    ensureSpace(ctx, size + lineGap + 4);
    const x = i === 0 ? baseX + indent : baseX;
    const isLast = i === lines.length - 1;
    if (justify && !bold) {
      drawJustifiedLine(ctx, lines[i], isLast, x, i === 0 ? firstLineW : usableW, size, usedFont, color);
    } else {
      ctx.page.drawText(lines[i].join(' '), { x, y: ctx.y, size, font: usedFont, color });
    }
    ctx.y -= size + lineGap;
  }
  ctx.y -= afterGap;
}

// ── Header BepeAI ─────────────────────────────────────────────
async function drawHeader(ctx: RenderCtx, titulo: string, logoBase64?: string): Promise<void> {
  const hH  = 68;
  const top = ctx.pageHeight;

  ctx.page.drawRectangle({ x: 0, y: top - hH, width: ctx.pageWidth, height: hH, color: BRAND_BLUE });
  ctx.page.drawRectangle({ x: 0, y: top - hH - 3, width: ctx.pageWidth, height: 3, color: BRAND_LIGHT });

  let logoDrawn = false;
  if (logoBase64) {
    try {
      const base64Data = logoBase64.split(',')[1] ?? logoBase64;
      const logoBytes  = Buffer.from(base64Data, 'base64');
      const isPng = logoBase64.includes('image/png') || base64Data.startsWith('iVBOR');
      const img   = isPng ? await ctx.pdfDoc.embedPng(logoBytes) : await ctx.pdfDoc.embedJpg(logoBytes);
      const dims  = img.scaleToFit(38, 38);
      ctx.page.drawImage(img, {
        x: ctx.margin.left,
        y: top - hH + (hH - dims.height) / 2,
        width: dims.width,
        height: dims.height,
      });
      logoDrawn = true;
    } catch { /* sem logo */ }
  }

  if (!logoDrawn) {
    const bx = ctx.margin.left + 18;
    const by = top - hH + hH / 2;
    ctx.page.drawCircle({ x: bx, y: by, size: 15, color: BRAND_LIGHT });
    const bW = ctx.fontBold.widthOfTextAtSize('B', 13);
    ctx.page.drawText('B', { x: bx - bW / 2, y: by - 5, size: 13, font: ctx.fontBold, color: WHITE });
  }

  const brandX = ctx.margin.left + 42;
  const brandY = top - hH + hH / 2 + 3;
  ctx.page.drawText('BepeAI', { x: brandX, y: brandY, size: 13, font: ctx.fontBold, color: WHITE });
  ctx.page.drawText('Automação Documental com IA', {
    x: brandX, y: brandY - 14, size: 7, font: ctx.font, color: rgb(0.7, 0.76, 0.92),
  });

  const titleSize = 10;
  const titleW = ctx.fontBold.widthOfTextAtSize(titulo, titleSize);
  ctx.page.drawText(titulo, {
    x: ctx.pageWidth - ctx.margin.right - titleW,
    y: top - hH + hH / 2 + 3,
    size: titleSize,
    font: ctx.fontBold,
    color: WHITE,
  });

  ctx.y = top - hH - 24;
}

// ── Seção de qualificação das partes ──────────────────────────
function drawParty(ctx: RenderCtx, label: string, content: string): void {
  ensureSpace(ctx, 70);

  // Badge colorido com label
  ctx.page.drawRectangle({
    x: ctx.margin.left, y: ctx.y - 2, width: 100, height: 14,
    color: rgb(0.91, 0.94, 0.99),
  });
  ctx.page.drawText(label, {
    x: ctx.margin.left + 4, y: ctx.y, size: 8.5,
    font: ctx.fontBold, color: BRAND_BLUE,
  });
  ctx.y -= 14;

  drawParagraph(ctx, content, { size: 9.5, justify: true, afterGap: 10 });
}

// ── Título de cláusula ────────────────────────────────────────
function drawClauseTitle(ctx: RenderCtx, text: string): void {
  ensureSpace(ctx, 32);
  ctx.y -= 4;

  ctx.page.drawLine({
    start: { x: ctx.margin.left, y: ctx.y + 13 },
    end:   { x: ctx.pageWidth - ctx.margin.right, y: ctx.y + 13 },
    thickness: 0.35,
    color: rgb(0.82, 0.87, 0.97),
  });

  ctx.page.drawText(text, {
    x: ctx.margin.left, y: ctx.y,
    size: 10.5, font: ctx.fontBold, color: BRAND_BLUE,
  });
  ctx.y -= 14;
}

// ── Bloco de assinaturas — contrato (duas partes + testemunhas) ──
function drawSignatureBlock(
  ctx: RenderCtx,
  left: { empresa: string; nome: string; cpf: string; papel: string },
  right: { empresa: string; nome: string; cpf: string; papel: string },
  cidade: string,
  data: string,
): void {
  ensureSpace(ctx, 130);
  ctx.y -= 12;

  const colW = (ctx.maxWidth - 24) / 2;
  const lx = ctx.margin.left;
  const rx = ctx.margin.left + colW + 24;

  // Local e data centralizados
  const localData = cidade && data ? `${cidade}, ${data}` : data || cidade || '';
  if (localData) {
    const ldW = ctx.font.widthOfTextAtSize(localData, 9.5);
    ctx.page.drawText(localData, {
      x: (ctx.pageWidth - ldW) / 2, y: ctx.y,
      size: 9.5, font: ctx.fontOblique, color: GRAY_MID,
    });
  }
  ctx.y -= 28;

  // Linhas de assinatura
  ctx.page.drawLine({ start: { x: lx, y: ctx.y }, end: { x: lx + colW, y: ctx.y }, thickness: 0.8, color: GRAY_DARK });
  ctx.page.drawLine({ start: { x: rx, y: ctx.y }, end: { x: rx + colW, y: ctx.y }, thickness: 0.8, color: GRAY_DARK });
  ctx.y -= 11;

  // Nome da empresa
  ctx.page.drawText(left.empresa.toUpperCase(),  { x: lx, y: ctx.y, size: 8.5, font: ctx.fontBold, color: GRAY_DARK });
  ctx.page.drawText(right.empresa.toUpperCase(), { x: rx, y: ctx.y, size: 8.5, font: ctx.fontBold, color: GRAY_DARK });
  ctx.y -= 10;

  // Papel
  ctx.page.drawText(left.papel,  { x: lx, y: ctx.y, size: 8, font: ctx.font, color: GRAY_MID });
  ctx.page.drawText(right.papel, { x: rx, y: ctx.y, size: 8, font: ctx.font, color: GRAY_MID });
  ctx.y -= 14;

  // Nome do representante
  ctx.page.drawText(`Repr.: ${left.nome}`,  { x: lx, y: ctx.y, size: 8, font: ctx.font, color: GRAY_MID });
  ctx.page.drawText(`Repr.: ${right.nome}`, { x: rx, y: ctx.y, size: 8, font: ctx.font, color: GRAY_MID });
  ctx.y -= 10;

  // CPF
  ctx.page.drawText(`CPF: ${left.cpf}`,  { x: lx, y: ctx.y, size: 8, font: ctx.font, color: GRAY_MID });
  ctx.page.drawText(`CPF: ${right.cpf}`, { x: rx, y: ctx.y, size: 8, font: ctx.font, color: GRAY_MID });
  ctx.y -= 24;

  // Testemunhas
  const twColW = (ctx.maxWidth - 24) / 2;
  ctx.page.drawLine({ start: { x: lx, y: ctx.y }, end: { x: lx + twColW, y: ctx.y }, thickness: 0.5, color: GRAY_LIGHT });
  ctx.page.drawLine({ start: { x: rx, y: ctx.y }, end: { x: rx + twColW, y: ctx.y }, thickness: 0.5, color: GRAY_LIGHT });
  ctx.y -= 9;
  ctx.page.drawText('Testemunha 1',  { x: lx, y: ctx.y, size: 7.5, font: ctx.font, color: GRAY_LIGHT });
  ctx.page.drawText('Testemunha 2',  { x: rx, y: ctx.y, size: 7.5, font: ctx.font, color: GRAY_LIGHT });
  ctx.y -= 8;
  ctx.page.drawText('Nome / CPF',  { x: lx, y: ctx.y, size: 7, font: ctx.font, color: GRAY_LIGHT });
  ctx.page.drawText('Nome / CPF',  { x: rx, y: ctx.y, size: 7, font: ctx.font, color: GRAY_LIGHT });
}

// ── Bloco de assinatura único (emitente/responsável) ──────────
function drawSingleSignature(
  ctx: RenderCtx,
  empresa: string,
  responsavel: string,
  papel: string,
  localData?: string,
): void {
  ensureSpace(ctx, 90);
  ctx.y -= 16;

  if (localData) {
    const ldW = ctx.font.widthOfTextAtSize(localData, 9.5);
    ctx.page.drawText(localData, {
      x: (ctx.pageWidth - ldW) / 2, y: ctx.y,
      size: 9.5, font: ctx.fontOblique, color: GRAY_MID,
    });
    ctx.y -= 28;
  }

  const colW = (ctx.maxWidth - 24) / 2;
  const cx   = ctx.margin.left + colW / 2;

  ctx.page.drawLine({ start: { x: cx, y: ctx.y }, end: { x: cx + colW, y: ctx.y }, thickness: 0.8, color: GRAY_DARK });
  ctx.y -= 11;
  ctx.page.drawText(empresa.toUpperCase(), { x: cx, y: ctx.y, size: 8.5, font: ctx.fontBold, color: GRAY_DARK });
  ctx.y -= 10;
  ctx.page.drawText(papel,                 { x: cx, y: ctx.y, size: 8,   font: ctx.font,     color: GRAY_MID  });
  ctx.y -= 11;
  ctx.page.drawText(`Repr.: ${responsavel}`, { x: cx, y: ctx.y, size: 8, font: ctx.font,     color: GRAY_MID  });
}

// ── Rodapé ────────────────────────────────────────────────────
function drawFooters(ctx: RenderCtx): void {
  const data  = new Date().toLocaleDateString('pt-BR');
  const total = ctx.pdfDoc.getPages().length;

  ctx.pdfDoc.getPages().forEach((pg, idx) => {
    const fy = ctx.margin.bottom - 18;

    pg.drawLine({
      start: { x: ctx.margin.left, y: fy + 12 },
      end:   { x: ctx.pageWidth - ctx.margin.right, y: fy + 12 },
      thickness: 0.35, color: GRAY_LIGHT,
    });

    pg.drawText(`BepeAI — Gerado em ${data}`, {
      x: ctx.margin.left, y: fy, size: 6.5,
      font: ctx.fontOblique, color: GRAY_MID,
    });

    const disc = 'Documento gerado por Inteligência Artificial — verifique antes de assinar';
    const dW   = ctx.font.widthOfTextAtSize(disc, 6);
    pg.drawText(disc, {
      x: (ctx.pageWidth - dW) / 2, y: fy, size: 6,
      font: ctx.fontOblique, color: GRAY_LIGHT,
    });

    const pageLabel = `Página ${idx + 1} de ${total}`;
    const pW = ctx.fontOblique.widthOfTextAtSize(pageLabel, 6.5);
    pg.drawText(pageLabel, {
      x: ctx.pageWidth - ctx.margin.right - pW, y: fy, size: 6.5,
      font: ctx.fontOblique, color: GRAY_MID,
    });
  });
}

// ── Renderizador principal ────────────────────────────────────
function renderContent(ctx: RenderCtx, conteudo: string, dados: Record<string, string>): void {
  const linhas = conteudo.split('\n');
  let i = 0;

  while (i < linhas.length) {
    const linha = linhas[i].trim();

    if (linha === '') { ctx.y -= 3; i++; continue; }

    // Qualificação das partes — qualquer rótulo seguido de ":"
    if (/^(CONTRATANTE|CONTRATADO|EMITENTE|DESTINATÁRIO|SOLICITANTE|EMPRESA|RESPONSÁVEL|PARTE DIVULGADORA|PARTE RECEPTORA):\s/.test(linha)) {
      const colonIdx = linha.indexOf(':');
      const label    = linha.slice(0, colonIdx);
      const content  = linha.slice(colonIdx + 1).trim();
      drawParty(ctx, label + ':', content);
      i++; continue;
    }

    // Título de cláusula (Cláusula Nª – Título)
    if (/^Cláusula\s+\d/i.test(linha)) {
      drawClauseTitle(ctx, linha);
      i++; continue;
    }

    // Alíneas a) b) c) — recuo hanging
    if (/^[a-z]\)\s/.test(linha)) {
      drawParagraph(ctx, linha, { size: 9.5, indent: 0, hangingIndent: 14, justify: true, afterGap: 3 });
      i++; continue;
    }

    // Parágrafos §
    if (/^§/.test(linha) || /^Parágrafo único/i.test(linha)) {
      drawParagraph(ctx, linha, { size: 9.5, indent: 18, justify: true, afterGap: 5 });
      i++; continue;
    }

    // ── Marcadores de assinatura ──────────────────────────────

    // Contrato: duas partes (contratante × contratado)
    if (linha === 'ASSINATURAS') {
      drawSignatureBlock(
        ctx,
        { empresa: dados['contratante_empresa'] ?? 'CONTRATANTE', nome: dados['contratante_nome'] ?? '', cpf: formatarCPF(dados['contratante_cpf'] ?? ''), papel: 'CONTRATANTE' },
        { empresa: dados['contratado_empresa']  ?? 'CONTRATADO',  nome: dados['contratado_nome']  ?? '', cpf: formatarCPF(dados['contratado_cpf']  ?? ''), papel: 'CONTRATADO'  },
        dados['cidade_assinatura'] ?? '',
        dados['data_assinatura']   ?? '',
      );
      i++; continue;
    }

    // NDA: divulgadora × receptora
    if (linha === 'NDA_ASSINATURAS') {
      drawSignatureBlock(
        ctx,
        { empresa: dados['divulgadora_empresa'] ?? 'PARTE DIVULGADORA', nome: dados['divulgadora_representante'] ?? '', cpf: formatarCPF(dados['divulgadora_cpf'] ?? ''), papel: 'PARTE DIVULGADORA' },
        { empresa: dados['receptora_empresa']   ?? 'PARTE RECEPTORA',   nome: dados['receptora_representante']   ?? '', cpf: formatarCPF(dados['receptora_cpf']   ?? ''), papel: 'PARTE RECEPTORA'   },
        dados['cidade_assinatura'] ?? '',
        dados['data_assinatura']   ?? '',
      );
      i++; continue;
    }

    // Proposta: assinatura única do emitente
    if (linha === 'PROPOSTA_ASSINATURA') {
      drawSingleSignature(
        ctx,
        dados['emitente_empresa']     ?? 'EMITENTE',
        dados['emitente_responsavel'] ?? '',
        'EMITENTE',
      );
      i++; continue;
    }

    // Orçamento: assinatura única do emitente
    if (linha === 'ORCAMENTO_ASSINATURA') {
      drawSingleSignature(
        ctx,
        dados['empresa_emitente']      ?? 'EMITENTE',
        dados['responsavel_emitente']  ?? '',
        'EMITENTE',
      );
      i++; continue;
    }

    // Relatório: assinatura única do responsável
    if (linha === 'RELATORIO_ASSINATURA') {
      drawSingleSignature(
        ctx,
        dados['empresa']      ?? 'EMPRESA',
        dados['responsavel']  ?? '',
        dados['cargo_responsavel'] ?? 'RESPONSÁVEL',
      );
      i++; continue;
    }

    // Linhas de local/data embutidas no template (já incorporadas nos blocos acima)
    if (/^LOCAL_ASSINATURA:|^LOCAL_EMISSAO:/.test(linha)) { i++; continue; }

    // Linha introdutória principal ("Pelo presente instrumento...")
    if (/^Pelo presente instrumento/i.test(linha)) {
      drawParagraph(ctx, linha, { size: 9.5, indent: 18, justify: true, afterGap: 8 });
      i++; continue;
    }

    // Linha de encerramento ("E, por estarem assim...")
    if (/^E,\s+por\s+estarem/i.test(linha)) {
      ctx.y -= 8;
      drawParagraph(ctx, linha, { size: 9.5, indent: 18, justify: true, afterGap: 4 });
      i++; continue;
    }

    // Cabeçalhos de lista
    const isListHeader = /Constituem obrigações|Este contrato poderá|descumprimento de qualquer/i.test(linha);
    if (isListHeader) {
      drawParagraph(ctx, linha, { size: 9.5, justify: true, afterGap: 2 });
      i++; continue;
    }

    // Metadados inline (Data de emissão:, PERÍODO:, etc.) — renderiza como bold + valor
    const metaMatch = linha.match(/^(Data de emissão|PERÍODO|Período):\s+(.+)$/i);
    if (metaMatch) {
      ctx.y -= 2;
      drawParagraph(ctx, linha, { size: 9, bold: false, italic: true, justify: false, afterGap: 4, color: GRAY_MID });
      i++; continue;
    }

    // Parágrafo normal — justificado
    drawParagraph(ctx, linha, { size: 9.5, justify: true, afterGap: 6 });
    i++;
  }
}

// ── Ponto de entrada público ──────────────────────────────────
export async function gerarPDF(
  dados: Record<string, string>,
  tipoDocumento: string,
  logoBase64?: string
): Promise<Buffer> {
  // 1. Preenche template
  let template = await carregarTemplate(tipoDocumento);

  // Campos derivados (extenso e formatados)
  const dadosCompletos: Record<string, string> = {
    ...dados,
    // contrato
    valor_total_extenso:         valorParaExtenso(dados['valor_total']       ?? ''),
    aviso_previo_extenso:        numeroPorExtenso(dados['aviso_previo']      ?? ''),
    data_assinatura_formatada:   dados['data_assinatura']                    ?? '',
    // proposta
    validade_proposta_extenso:   numeroPorExtenso(dados['validade_proposta'] ?? ''),
    // orcamento
    valor_unitario_extenso:      valorParaExtenso(dados['valor_unitario']    ?? ''),
    // nda
    vigencia_meses_extenso:      numeroPorExtenso(dados['vigencia_meses']    ?? ''),
    prazo_confidencialidade_extenso: numeroPorExtenso(dados['prazo_confidencialidade'] ?? ''),
    penalidade_valor_extenso:    valorParaExtenso(dados['penalidade_valor']  ?? ''),
  };

  if (template.includes('{{_dados_}}')) {
    const linhasDados = Object.entries(dados)
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${limparValor(v)}`)
      .join('\n');
    template = template.replace('{{_dados_}}', linhasDados);
  }

  let conteudo = template;
  for (const [key, value] of Object.entries(dadosCompletos)) {
    conteudo = conteudo.replace(new RegExp(`{{${key}}}`, 'g'), formatarCampo(key, value));
  }
  conteudo = conteudo.replace(/{{[^}]+}}/g, '___________');

  // 2. Prepara documento
  const pdfDoc = await PDFDocument.create();
  const pageW  = 595.28;
  const pageH  = 841.89;
  const margin = { top: 84, bottom: 50, left: 56, right: 56 };

  const font        = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const page = pdfDoc.addPage([pageW, pageH]);
  const ctx: RenderCtx = {
    pdfDoc, page,
    y: pageH - margin.top,
    font, fontBold, fontOblique,
    margin,
    pageWidth:  pageW,
    pageHeight: pageH,
    maxWidth:   pageW - margin.left - margin.right,
  };

  // 3. Cabeçalho
  const titulo = TITULOS[tipoDocumento] ?? tipoDocumento.replace(/_/g, ' ').toUpperCase();
  await drawHeader(ctx, titulo, logoBase64);

  // 4. Corpo
  renderContent(ctx, conteudo, dadosCompletos);

  // 5. Rodapés
  drawFooters(ctx);

  const pdfBytes = await pdfDoc.save();
  logger.info({ tipo: tipoDocumento, pages: pdfDoc.getPages().length }, '[PDF] Documento gerado');
  return Buffer.from(pdfBytes);
}
