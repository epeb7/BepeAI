// intent.service.ts — Detecção de intenções com linguagem natural

export type Intent =
  | 'CREATE_DOCUMENT'   // usuário está respondendo perguntas do workflow
  | 'EDIT_FIELD'        // usuário quer corrigir um campo
  | 'CONFIRM'           // usuário confirma geração do PDF
  | 'CANCEL'            // usuário quer recomeçar
  | 'HELP'              // usuário pede ajuda
  | 'QUERY_DATA'        // usuário pergunta quais dados já foram coletados
  | 'UNKNOWN';

const PATTERNS = {
  CONFIRM: [
    /^sim$/i, /^ok$/i, /^gerar?( pdf)?$/i, /^confirmar?$/i, /^pode gerar$/i,
    /^tudo( (certo|ok|bem))?$/i, /^perfeito$/i, /^isso$/i, /^correto$/i,
    /^gera( a[ií])?$/i, /^pode$/i, /^vai$/i, /^pronto( (pra|para) gerar)?$/i,
    /^agora$/i, /^baixar?$/i, /^quero$/i, /^continua?$/i,
    // "me envie o pdf", "me manda o pdf", "envia o pdf"
    /\b(me )?(envi[ae]|manda|mand[ae])\b.*\bpdf\b/i,
    // "gerar agora", "gera o pdf agora", "pode gerar agora"
    /\b(ger[ae]r?|baixar?|criar?|fazer?|emitir?)\b/i,
    // qualquer menção a PDF quando o workflow está completo
    /\bpdf\b/i,
    /^(pode |vamos )?(gerar|baixar|criar|fazer|emitir)( o)? (pdf|documento|contrato|proposta|relat[oó]rio|or[cç]amento|nda|acordo)/i,
  ],
  CANCEL: [
    /^cancelar?$/i, /^nova conversa$/i, /^reset$/i, /^come[cç]ar( de)? novo$/i,
    /^recomeçar?$/i, /^zerar$/i, /^limpar?$/i, /^desistir?$/i,
    /\b(come[cç]ar|iniciar) (de novo|novamente|tudo)\b/i,
    /\b(quero|vou) (cancelar|recomeçar|desistir)\b/i,
  ],
  HELP: [
    /^ajuda?$/i, /^help$/i, /^\?+$/, /^como (funciona|usar|uso)/i,
    /\bnão (sei|entendo|entendi)\b/i,
    /\bcomo (devo|posso|preciso) (responder|fornecer|informar|escrever)\b/i,
    /\bme (ajuda|ajude|explica|explique)\b/i,
  ],
  EDIT: [
    /\b(corrigir?|alterar?|mudar?|editar?|trocar?|atualizar?)\s+(\w+)/i,
    /\b(erro|errei|errado|incorreto|errada|incorreta)\b.*\b(\w+)\b/i,
    /\bvoltar? (para|ao|no) campo\b/i,
    /\b(preciso|quero|vou) (corrigir?|alterar?|mudar?) (o |a )?(\w+)/i,
  ],
  QUERY_DATA: [
    /\b(que|quais|o que|quant[ao]s?)\b.*\b(dados?|informa[çc][oõ]es?|campos?|preencheu?|tem|tenho|coletou?|registrou?)\b/i,
    /\b(o que (voc[eê]|vc) (tem|sabe|coletou|registrou|preencheu))\b/i,
    /\b(mostra|exibe|lista|resume|resumo)\b.*\b(dados?|informa[çc][oõ]es?|campos?)\b/i,
    /\b(ver|visualizar|conferir|checar)\b.*\b(dados?|o que (foi|j[aá]|est[aá]))\b/i,
    /\b(o que (j[aá]|est[aá]) (preenchido|salvo|registrado|coletado))\b/i,
  ],
};

export function detectIntent(message: string, isWorkflowComplete: boolean): Intent {
  const lower = message.toLowerCase().trim();

  if (PATTERNS.CANCEL.some(p => p.test(lower)))     return 'CANCEL';
  if (PATTERNS.HELP.some(p => p.test(lower)))        return 'HELP';
  if (PATTERNS.QUERY_DATA.some(p => p.test(lower)))  return 'QUERY_DATA';
  if (PATTERNS.EDIT.some(p => p.test(lower)))        return 'EDIT_FIELD';

  if (isWorkflowComplete && PATTERNS.CONFIRM.some(p => p.test(lower))) return 'CONFIRM';

  if (!isWorkflowComplete) return 'CREATE_DOCUMENT';

  return 'UNKNOWN';
}

export function extractFieldToEdit(message: string): string | null {
  const patterns = [
    /\b(?:corrigir?|alterar?|mudar?|editar?|trocar?|atualizar?)\s+(?:o |a )?(\w+)/i,
    /\b(?:preciso|quero|vou)\s+(?:corrigir?|alterar?|mudar?)\s+(?:o |a )?(\w+)/i,
    /\berro\b.*\b(\w+)\b/i,
  ];
  for (const p of patterns) {
    const m = message.match(p);
    if (m?.[1] && m[1].length > 2) return m[1].toLowerCase();
  }
  return null;
}
