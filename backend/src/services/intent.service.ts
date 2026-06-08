// intent.service.ts - Detecção de intenções e extração de comandos

export type Intent = 
  | 'CREATE_DOCUMENT'   // usuário está respondendo perguntas do workflow
  | 'EDIT_FIELD'        // usuário quer corrigir um campo ("corrigir empresa")
  | 'CONFIRM'           // usuário confirma geração do PDF ("sim", "gerar pdf")
  | 'CANCEL'            // usuário quer recomeçar ("cancelar", "nova conversa")
  | 'HELP'              // usuário pede ajuda ("ajuda", "help")
  | 'UNKNOWN';          // não identificado

/**
 * Detecta a intenção do usuário com base na mensagem e no estado de completude do workflow.
 * @param message Mensagem do usuário
 * @param isWorkflowComplete Se o workflow atual já foi concluído (todos os campos preenchidos)
 */
export function detectIntent(message: string, isWorkflowComplete: boolean): Intent {
  const lower = message.toLowerCase().trim();

  // Comandos de confirmação (apenas se workflow estiver completo)
  if (isWorkflowComplete) {
    if (lower === 'sim' || lower === 'gerar pdf' || lower === 'confirmar' || lower === 'ok') {
      return 'CONFIRM';
    }
  }

  // Comandos de cancelamento a qualquer momento
  if (lower === 'cancelar' || lower === 'nova conversa' || lower === 'reset' || lower === 'começar de novo') {
    return 'CANCEL';
  }

  // Ajuda
  if (lower === 'ajuda' || lower === 'help' || lower === '?') {
    return 'HELP';
  }

  // Comandos de correção (ex: "corrigir empresa", "alterar cnpj", "mudar valor")
  const editPattern = /^(corrigir|alterar|mudar|editar)\s+(\w+)/i;
  if (editPattern.test(lower)) {
    return 'EDIT_FIELD';
  }

  // Se o workflow não está completo, assume que é resposta para o campo atual
  if (!isWorkflowComplete) {
    return 'CREATE_DOCUMENT';
  }

  return 'UNKNOWN';
}

/**
 * Extrai o nome do campo que o usuário deseja corrigir.
 * Exemplo: "corrigir empresa" → "empresa"
 */
export function extractFieldToEdit(message: string): string | null {
  const match = message.toLowerCase().match(/(?:corrigir|alterar|mudar|editar)\s+(\w+)/i);
  return match ? match[1] : null;
}