import { Response } from 'express';
import { gerarPDF } from '../services/pdf.service';
import { AuthRequest } from '../middlewares/auth.middleware';

export const generatePDF = async (req: AuthRequest, res: Response) => {
  try {
    const { dados, logoBase64 } = req.body;
    const tipoDocumento = dados.tipoDocumento || 'contrato';

    if (!dados) {
      return res.status(400).json({ error: 'Dados não fornecidos' });
    }

    const pdfBuffer = await gerarPDF(dados, tipoDocumento, logoBase64);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${tipoDocumento}_${Date.now()}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    res.status(500).json({ error: 'Erro ao gerar PDF' });
  }
};