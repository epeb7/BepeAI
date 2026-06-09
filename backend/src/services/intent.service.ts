// intent.service.ts — Detecção de intenções com linguagem natural

export type Intent =
  | 'CREATE_DOCUMENT'   // usuário está respondendo perguntas do workflow
  | 'EDIT_FIELD'        // usuário quer corrigir um campo
  | 'CONFIRM'           // usuário confirma geração do PDF
  | 'CANCEL'            // usuário quer recomeçar
  | 'HELP'              // usuário pede ajuda
  | 'QUERY_DATA'        // usuário pergunta quais dados já foram coletados
  | 'UNKNOWN';

// Normaliza texto: minúsculas + remove acentos para comparação
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Caractere de palavra que inclui letras acentuadas
const W = '[\\w\\u00C0-\\u024F]';

const PATTERNS = {
  CONFIRM: [
    /^sim$/i, /^ok$/i, /^gerar?( pdf)?$/i, /^confirmar?$/i, /^pode gerar$/i,
    /^tudo( (certo|ok|bem))?$/i, /^perfeito$/i, /^isso$/i, /^correto$/i,
    /^gera( a[ií])?$/i, /^pode$/i, /^vai$/i, /^pronto( (pra|para) gerar)?$/i,
    /^agora$/i, /^baixar?$/i, /^quero$/i, /^continua?$/i,
    /\b(me )?(envi[ae]|manda|mand[ae])\b.*\bpdf\b/i,
    /\b(ger[ae]r?|baixar?|criar?|fazer?|emitir?)\b/i,
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
    /\bcomo (devo|posso|preciso) (responder|fornecer|informar|escrever)\b/i,
    /\bme (ajuda|ajude|explica|explique)\b/i,
  ],
  // EDIT: detecta intenção de corrigir — usa norm() para lidar com acentos
  EDIT: [
    // "corrigir empresa", "alterar cnpj", "mudar endereço", "editar razão social"
    new RegExp(`\\b(corrigir?|alterar?|mudar?|editar?|trocar?|atualizar?)\\s+(o\\s+|a\\s+|os\\s+|as\\s+)?${W}`, 'i'),
    // "quero corrigir o valor", "preciso mudar a data"
    new RegExp(`\\b(preciso|quero|vou|gostaria)\\s+(?:de\\s+)?(corrigir?|alterar?|mudar?|editar?|trocar?)\\s+(o\\s+|a\\s+|os\\s+|as\\s+)?${W}`, 'i'),
    // "errei o cnpj", "errado o endereço"
    new RegExp(`\\b(err[oa]r?|errei|errado[as]?|incorreto[as]?)\\b.+\\b${W}{2}`, 'i'),
    // "voltar para empresa", "voltar ao cnpj"
    /\bvoltar? (para|ao|no|a)\b/i,
    // "o valor está errado", "a empresa está incorreta"
    new RegExp(`\\b${W}+\\s+(est[aá]|ficou)\\s+(errado[as]?|incorreto[as]?|errada?)\\b`, 'i'),
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
  const lower = norm(message);

  if (PATTERNS.CANCEL.some(p => p.test(lower)))     return 'CANCEL';
  if (PATTERNS.HELP.some(p => p.test(lower)))        return 'HELP';
  if (PATTERNS.QUERY_DATA.some(p => p.test(lower)))  return 'QUERY_DATA';
  if (PATTERNS.EDIT.some(p => p.test(lower)))        return 'EDIT_FIELD';

  if (isWorkflowComplete && PATTERNS.CONFIRM.some(p => p.test(lower))) return 'CONFIRM';

  if (!isWorkflowComplete) return 'CREATE_DOCUMENT';

  return 'UNKNOWN';
}

// Extrai o hint do campo que o usuário quer editar.
// Retorna string normalizada (sem acentos, minúsculas) para comparação fuzzy.
export function extractFieldToEdit(message: string): string | null {
  const normalized = norm(message);

  // Padrões ordenados do mais específico para o mais genérico
  const patterns = [
    // "corrigir razão social" → captura "razão social" (multi-palavra)
    new RegExp(`(?:corrigir?|alterar?|mudar?|editar?|trocar?|atualizar?)\\s+(?:o\\s+|a\\s+|os\\s+|as\\s+)?([${W.slice(1,-1)}][\\w\\u00C0-\\u024F\\s]{1,40})`, 'i'),
    // "preciso mudar a empresa contratante"
    new RegExp(`(?:preciso|quero|vou|gostaria)\\s+(?:de\\s+)?(?:corrigir?|alterar?|mudar?|editar?)\\s+(?:o\\s+|a\\s+|os\\s+|as\\s+)?([${W.slice(1,-1)}][\\w\\u00C0-\\u024F\\s]{1,40})`, 'i'),
    // "o cnpj está errado" → captura "cnpj"
    new RegExp(`(?:o\\s+|a\\s+)?([\\w\\u00C0-\\u024F]{2,30})\\s+(?:est[aá]|ficou)\\s+(?:errado|incorreto|errada)`, 'i'),
    // "errei o endereço" → captura "endereço"
    new RegExp(`(?:err[oa]r?|errei)\\s+(?:o\\s+|a\\s+)?([\\w\\u00C0-\\u024F\\s]{2,30})`, 'i'),
  ];

  for (const p of patterns) {
    const m = normalized.match(p);
    if (m?.[1]) {
      const captured = m[1].trim();
      // Descarta capturas muito curtas ou que sejam artigos/pronomes
      if (captured.length < 2) continue;
      const artigos = new Set(['o', 'a', 'os', 'as', 'um', 'uma', 'de', 'do', 'da']);
      if (artigos.has(captured)) continue;
      return captured.trim();
    }
  }
  return null;
}
