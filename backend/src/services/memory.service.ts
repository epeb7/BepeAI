/**
 * Memory Service — memória adaptativa por usuário.
 *
 * Persiste campos recorrentes entre documentos (empresa, CNPJ, endereço, foro).
 * Quanto mais um valor aparece, maior sua confidence. No início de cada conversa,
 * as top memórias são injetadas no system prompt para a IA sugerir reutilização.
 */

import { supabase, supabaseEnabled } from '../lib/supabase';
import logger from '../lib/logger';

// ── Campos que vale memorizar ─────────────────────────────────
// Identificadores e localização da empresa do usuário — raramente mudam.
// Excluímos datas, valores financeiros e objetos de serviço — mudam por documento.
const CAMPOS_MEMORAVEIS = new Set([
  // Contratante / empresa do usuário
  'contratante_empresa',  'contratante_cnpj',   'contratante_endereco',
  'contratante_cidade',   'contratante_estado',  'contratante_nome',
  'contratante_cargo',    'contratante_cpf',
  // Emitente (proposta e orçamento)
  'emitente_empresa',     'emitente_cnpj',       'emitente_endereco',
  'emitente_cidade',      'emitente_estado',     'emitente_responsavel',
  'emitente_cargo',       'emitente_email',      'emitente_telefone',
  'empresa_emitente',     'cnpj_emitente',       'endereco_emitente',
  'responsavel_emitente', 'telefone_emitente',
  // Relatório
  'empresa_relatorio',    'cnpj_relatorio',      'responsavel_relatorio',
  'cargo_relatorio',
  // NDA — parte divulgadora (geralmente é o próprio usuário)
  'parte_divulgadora',    'cnpj_divulgadora',    'representante_divulgadora',
  // Dados jurídicos recorrentes
  'foro_comarca',         'cidade_assinatura',
]);

// Threshold mínimo de confidence para sugerir um valor ao usuário
const CONFIDENCE_MIN_SUGESTAO = 2;

export interface MemoriaUsuario {
  key:        string;
  value:      string;
  confidence: number;
}

// ── Lê as memórias com maior confiança ───────────────────────
export async function getMemoria(userId: string, limit = 20): Promise<MemoriaUsuario[]> {
  if (!supabaseEnabled || !supabase) return [];

  try {
    const { data, error } = await supabase
      .from('user_memory')
      .select('key, value, confidence')
      .eq('user_id', userId)
      .order('confidence', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []) as MemoriaUsuario[];
  } catch (err) {
    logger.warn({ err, userId }, '[Memory] Falha ao carregar memória');
    return [];
  }
}

// ── Atualiza (ou cria) uma entrada de memória ─────────────────
// Usa upsert: se o valor for igual ao existente, incrementa confidence.
// Se o valor mudou, substitui e reinicia confidence em 1.
export async function upsertMemoria(userId: string, key: string, value: string): Promise<void> {
  if (!supabaseEnabled || !supabase) return;
  if (!value?.trim()) return;

  try {
    // Busca o valor atual para decidir entre incremento e substituição
    const { data: existing } = await supabase
      .from('user_memory')
      .select('value, confidence')
      .eq('user_id', userId)
      .eq('key', key)
      .single();

    if (existing && existing.value === value.trim()) {
      // Mesmo valor — incrementa confidence
      await supabase
        .from('user_memory')
        .update({ confidence: existing.confidence + 1, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('key', key);
    } else {
      // Valor novo ou primeiro registro — upsert com confidence inicial
      await supabase
        .from('user_memory')
        .upsert({
          user_id:    userId,
          key,
          value:      value.trim(),
          confidence: existing ? 1 : 1,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,key' });
    }
  } catch (err) {
    logger.warn({ err, userId, key }, '[Memory] Falha ao atualizar memória');
  }
}

// ── Extrai e persiste campos memoráveis de um documento concluído ──
// Chamado fire-and-forget após completeConversation.
export async function memorizarDocumento(
  userId: string,
  finalData: Record<string, string>
): Promise<void> {
  if (!supabaseEnabled || !supabase) return;
  if (!finalData || Object.keys(finalData).length === 0) return;

  const ops: Promise<void>[] = [];
  for (const [key, value] of Object.entries(finalData)) {
    if (CAMPOS_MEMORAVEIS.has(key) && value?.trim()) {
      ops.push(upsertMemoria(userId, key, value));
    }
  }

  if (ops.length > 0) {
    await Promise.allSettled(ops);
    logger.debug({ userId, campos: ops.length }, '[Memory] Documento memorizado');
  }
}

// ── Tom preferido do usuário ──────────────────────────────────
export type TomPreferido = 'formal' | 'executivo' | 'direto';

const TOM_INSTRUCOES: Record<TomPreferido, string> = {
  formal:     'Use linguagem formal e técnica, com tratamento de "senhor/senhora". Evite informalidades.',
  executivo:  'Use linguagem profissional e direta, sem excessos formais. Tom de consultor de negócios.',
  direto:     'Seja conciso e objetivo. Respostas curtas, sem rodeios. Vai direto ao ponto.',
};

export async function getUserTone(userId: string): Promise<TomPreferido> {
  if (!supabaseEnabled || !supabase) return 'executivo';
  try {
    const { data } = await supabase
      .from('users')
      .select('preferred_tone')
      .eq('id', userId)
      .single();
    const tone = data?.preferred_tone as TomPreferido | null;
    return (tone && tone in TOM_INSTRUCOES) ? tone : 'executivo';
  } catch {
    return 'executivo';
  }
}

export function formatarTomParaPrompt(tom: TomPreferido): string {
  return `TOM DE RESPOSTA: ${TOM_INSTRUCOES[tom]}`;
}

// ── Formata bloco de memória para o system prompt ─────────────
// Retorna string vazia se não houver memórias com confidence suficiente.
// Só inclui valores que apareceram ao menos CONFIDENCE_MIN_SUGESTAO vezes
// para evitar sugestões baseadas em dados de um único documento.
export function formatarMemoriaParaPrompt(memorias: MemoriaUsuario[]): string {
  const relevantes = memorias.filter(m => m.confidence >= CONFIDENCE_MIN_SUGESTAO);
  if (relevantes.length === 0) return '';

  const LABELS: Record<string, string> = {
    contratante_empresa:    'Empresa do usuário',
    contratante_cnpj:       'CNPJ do usuário',
    contratante_endereco:   'Endereço do usuário',
    contratante_cidade:     'Cidade do usuário',
    contratante_estado:     'Estado do usuário',
    contratante_nome:       'Nome do responsável',
    contratante_cargo:      'Cargo do responsável',
    emitente_empresa:       'Empresa emitente',
    emitente_cnpj:          'CNPJ emitente',
    emitente_endereco:      'Endereço emitente',
    emitente_cidade:        'Cidade emitente',
    emitente_estado:        'Estado emitente',
    emitente_responsavel:   'Responsável emitente',
    empresa_emitente:       'Empresa emitente',
    cnpj_emitente:          'CNPJ emitente',
    endereco_emitente:      'Endereço emitente',
    responsavel_emitente:   'Responsável emitente',
    empresa_relatorio:      'Empresa (relatório)',
    cnpj_relatorio:         'CNPJ (relatório)',
    responsavel_relatorio:  'Responsável (relatório)',
    parte_divulgadora:      'Empresa divulgadora (NDA)',
    cnpj_divulgadora:       'CNPJ divulgadora (NDA)',
    foro_comarca:           'Foro/Comarca habitual',
    cidade_assinatura:      'Cidade de assinatura habitual',
  };

  const linhas = relevantes.map(m => {
    const label = LABELS[m.key] ?? m.key.replace(/_/g, ' ');
    return `  ${label}: ${m.value}`;
  });

  return [
    'DADOS RECORRENTES DO USUÁRIO (valores usados em documentos anteriores — sugira reutilizá-los quando pertinente, mas sempre confirme antes de aplicar):',
    ...linhas,
  ].join('\n');
}
