import { Response } from 'express';
import { gerarPDF } from '../services/pdf.service';
import { AuthRequest } from '../middlewares/auth.middleware';
import { ALLOWED_DOCUMENT_TYPES } from '../workflows/definitions';
import logger from '../lib/logger';

export const generatePDF = async (req: AuthRequest, res: Response) => {
  const { dados, logoBase64 } = req.body;

  if (!dados || typeof dados !== 'object') {
    return res.status(400).json({ error: 'Dados não fornecidos ou inválidos' });
  }

  const tipoDocumento: string = dados.tipoDocumento ?? '';

  // Whitelist — previne path traversal e tipos inválidos
  if (!ALLOWED_DOCUMENT_TYPES.includes(tipoDocumento)) {
    logger.warn(
      { userId: req.userId, tipoDocumento },
      '[PDF] Tipo de documento inválido rejeitado'
    );
    return res.status(400).json({
      error: `Tipo de documento inválido. Tipos permitidos: ${ALLOWED_DOCUMENT_TYPES.join(', ')}`,
    });
  }

  // Valida tamanho da logo — máx ~2MB em base64 (~2.7MB raw)
  if (logoBase64 && typeof logoBase64 === 'string' && logoBase64.length > 2_800_000) {
    return res.status(400).json({ error: 'Logo muito grande. Tamanho máximo: 2MB.' });
  }

  // Remove tipoDocumento dos dados antes de passar ao template
  const { tipoDocumento: _tipo, ...dadosLimpos } = dados as Record<string, string>;

  try {
    const pdfBuffer = await gerarPDF(dadosLimpos, tipoDocumento, logoBase64);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${tipoDocumento}_${Date.now()}.pdf"`
    );
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

    logger.info(
      { userId: req.userId, tipoDocumento, bytes: pdfBuffer.length },
      '[PDF] Documento enviado'
    );
  } catch (err) {
    logger.error({ err, userId: req.userId, tipoDocumento }, '[PDF] Erro ao gerar documento');
    res.status(500).json({ error: 'Erro ao gerar o documento PDF. Tente novamente.' });
  }
};
