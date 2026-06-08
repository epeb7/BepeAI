// ============================================================
// definitions.ts — Workflows, FieldGroups e tipos do sistema
// ============================================================

// ---------- Tipos base ----------

export interface WorkflowStep {
  field: string;
  label?: string;  // label legível para o usuário (opcional)
  question: string;
  validator?: (value: string) => boolean;
  errorMessage?: string;
  example?: string;
  required: boolean;
}

/**
 * FieldGroup agrupa campos relacionados numa única interação conversacional.
 * Reduz ~30 perguntas sequenciais para 5–8 interações inteligentes.
 */
export interface FieldGroup {
  id: string;
  label: string;
  question: string;
  fields: string[];
  example?: string;
}

export interface WorkflowDefinition {
  name: string;
  steps: WorkflowStep[];
  fieldGroups: FieldGroup[];
}

// ---------- Validadores reutilizáveis ----------

const validators = {
  cnpj: (v: string) => /^\d{14}$/.test(v),
  cpf: (v: string) => /^\d{11}$/.test(v),
  data: (v: string) => /^\d{2}\/\d{2}\/\d{4}$/.test(v),
  valor: (v: string) => /^\d+(?:[.,]\d+)?$/.test(v),
  nomeEmpresa: (v: string) => v.trim().length >= 2,
};

// ============================================================
// CONTRATO DE PRESTAÇÃO DE SERVIÇOS
// 30 campos → 6 grupos (redução de 80% nas interações)
// ============================================================

const contratoSteps: WorkflowStep[] = [
  // CONTRATANTE
  { field: 'contratante_empresa', label: 'Razão social', question: 'Razão social da Contratante:', required: true, example: 'Tech Soluções Ltda', validator: validators.nomeEmpresa, errorMessage: 'Nome inválido (mín. 2 caracteres)' },
  { field: 'contratante_cnpj', label: 'CNPJ', question: 'CNPJ (14 dígitos):', validator: validators.cnpj, required: true, example: '12345678000199', errorMessage: 'CNPJ deve ter exatamente 14 dígitos' },
  { field: 'contratante_endereco', label: 'Endereço', question: 'Endereço completo:', required: true, example: 'Rua das Flores, 123' },
  { field: 'contratante_cidade', label: 'Cidade', question: 'Cidade:', required: true, example: 'São Paulo' },
  { field: 'contratante_estado', label: 'Estado', question: 'Estado (sigla UF):', required: true, example: 'SP' },
  { field: 'contratante_cargo', label: 'Cargo', question: 'Cargo do representante legal:', required: true, example: 'Diretor' },
  { field: 'contratante_nome', label: 'Nome', question: 'Nome completo do representante:', required: true, example: 'João Silva' },
  { field: 'contratante_nacionalidade', label: 'Nacionalidade', question: 'Nacionalidade:', required: true, example: 'Brasileiro' },
  { field: 'contratante_estado_civil', label: 'Estado civil', question: 'Estado civil:', required: true, example: 'Casado' },
  { field: 'contratante_profissao', label: 'Profissão', question: 'Profissão:', required: true, example: 'Empresário' },
  { field: 'contratante_rg', label: 'RG', question: 'RG (somente números):', required: true, example: '123456789' },
  { field: 'contratante_cpf', label: 'CPF', question: 'CPF (11 dígitos):', validator: validators.cpf, required: true, example: '12345678901', errorMessage: 'CPF deve ter exatamente 11 dígitos' },
  // CONTRATADO
  { field: 'contratado_empresa', label: 'Razão social', question: 'Razão social da Contratada:', required: true, example: 'Consultoria ABC Ltda', validator: validators.nomeEmpresa, errorMessage: 'Nome inválido (mín. 2 caracteres)' },
  { field: 'contratado_cnpj', label: 'CNPJ', question: 'CNPJ (14 dígitos):', validator: validators.cnpj, required: true, example: '98765432000188', errorMessage: 'CNPJ deve ter exatamente 14 dígitos' },
  { field: 'contratado_endereco', label: 'Endereço', question: 'Endereço completo:', required: true, example: 'Av. Paulista, 1000' },
  { field: 'contratado_cidade', label: 'Cidade', question: 'Cidade:', required: true, example: 'São Paulo' },
  { field: 'contratado_estado', label: 'Estado', question: 'Estado (sigla UF):', required: true, example: 'SP' },
  { field: 'contratado_cargo', label: 'Cargo', question: 'Cargo do representante legal:', required: true, example: 'Gerente' },
  { field: 'contratado_nome', label: 'Nome', question: 'Nome completo do representante:', required: true, example: 'Maria Santos' },
  { field: 'contratado_nacionalidade', label: 'Nacionalidade', question: 'Nacionalidade:', required: true, example: 'Brasileira' },
  { field: 'contratado_estado_civil', label: 'Estado civil', question: 'Estado civil:', required: true, example: 'Solteira' },
  { field: 'contratado_profissao', label: 'Profissão', question: 'Profissão:', required: true, example: 'Consultora' },
  { field: 'contratado_rg', label: 'RG', question: 'RG (somente números):', required: true, example: '987654321' },
  { field: 'contratado_cpf', label: 'CPF', question: 'CPF (11 dígitos):', validator: validators.cpf, required: true, example: '98765432100', errorMessage: 'CPF deve ter exatamente 11 dígitos' },
  // CLÁUSULAS
  { field: 'objeto_servicos', label: 'Serviço', question: 'Descreva o serviço a ser prestado:', required: true, example: 'Desenvolvimento de software' },
  { field: 'data_inicio', label: 'Data de início', question: 'Data de início (DD/MM/AAAA):', validator: validators.data, required: true, example: '01/07/2026', errorMessage: 'Formato inválido. Use DD/MM/AAAA' },
  { field: 'data_fim', label: 'Data de término', question: 'Data de término (DD/MM/AAAA):', validator: validators.data, required: true, example: '31/12/2026', errorMessage: 'Formato inválido. Use DD/MM/AAAA' },
  { field: 'valor_total', label: 'Valor total', question: 'Valor total (R$):', validator: validators.valor, required: true, example: '50000', errorMessage: 'Informe apenas o número (ex: 50000)' },
  { field: 'forma_pagamento', label: 'Forma de pagamento', question: 'Forma de pagamento:', required: true, example: 'Mensal' },
  { field: 'dia_pagamento', label: 'Dia de vencimento', question: 'Dia de vencimento:', required: true, example: '10' },
  { field: 'aviso_previo', label: 'Aviso prévio', question: 'Prazo de aviso prévio (em dias):', required: true, example: '30' },
  { field: 'foro_comarca', label: 'Foro', question: 'Cidade do foro judicial:', required: true, example: 'São Paulo' },
  { field: 'cidade_assinatura', label: 'Local de assinatura', question: 'Cidade de assinatura:', required: true, example: 'São Paulo' },
  { field: 'data_assinatura', label: 'Data de assinatura', question: 'Data de assinatura (DD/MM/AAAA):', validator: validators.data, required: true, example: '01/07/2026', errorMessage: 'Formato inválido. Use DD/MM/AAAA' },
];

const contratoGroups: FieldGroup[] = [
  {
    id: 'contratante_dados',
    label: 'Dados da Contratante',
    question: '🏢 Dados da empresa **CONTRATANTE**.\n\nInforme no formato abaixo (pode ser numa linha só ou em várias):\n\n• **Razão social:**\n• **CNPJ:**\n• **Endereço:**\n• **Cidade:**\n• **Estado (sigla UF):**',
    fields: ['contratante_empresa', 'contratante_cnpj', 'contratante_endereco', 'contratante_cidade', 'contratante_estado'],
    example: 'Exemplo:\nRazão social: Tech Soluções Ltda\nCNPJ: 12345678000199\nEndereço: Rua das Flores, 123\nCidade: São Paulo\nEstado: SP',
  },
  {
    id: 'contratante_rep',
    label: 'Representante da Contratante',
    question: '👤 Representante legal da **CONTRATANTE**.\n\nInforme:\n\n• **Cargo:**\n• **Nome completo:**\n• **Nacionalidade:**\n• **Estado civil:**\n• **Profissão:**\n• **RG:**\n• **CPF:**',
    fields: ['contratante_cargo', 'contratante_nome', 'contratante_nacionalidade', 'contratante_estado_civil', 'contratante_profissao', 'contratante_rg', 'contratante_cpf'],
    example: 'Exemplo:\nCargo: Diretor\nNome: João Silva\nNacionalidade: Brasileiro\nEstado civil: Casado\nProfissão: Empresário\nRG: 123456789\nCPF: 12345678901',
  },
  {
    id: 'contratado_dados',
    label: 'Dados da Contratada',
    question: '🏢 Dados da empresa **CONTRATADA**.\n\nInforme:\n\n• **Razão social:**\n• **CNPJ:**\n• **Endereço:**\n• **Cidade:**\n• **Estado (sigla UF):**',
    fields: ['contratado_empresa', 'contratado_cnpj', 'contratado_endereco', 'contratado_cidade', 'contratado_estado'],
    example: 'Exemplo:\nRazão social: Consultoria ABC Ltda\nCNPJ: 98765432000188\nEndereço: Av. Paulista, 1000\nCidade: São Paulo\nEstado: SP',
  },
  {
    id: 'contratado_rep',
    label: 'Representante da Contratada',
    question: '👤 Representante legal da **CONTRATADA**.\n\nInforme:\n\n• **Cargo:**\n• **Nome completo:**\n• **Nacionalidade:**\n• **Estado civil:**\n• **Profissão:**\n• **RG:**\n• **CPF:**',
    fields: ['contratado_cargo', 'contratado_nome', 'contratado_nacionalidade', 'contratado_estado_civil', 'contratado_profissao', 'contratado_rg', 'contratado_cpf'],
    example: 'Exemplo:\nCargo: Gerente\nNome: Maria Santos\nNacionalidade: Brasileira\nEstado civil: Solteira\nProfissão: Consultora\nRG: 987654321\nCPF: 98765432100',
  },
  {
    id: 'contrato_objeto',
    label: 'Objeto do Contrato',
    question: '📋 Qual é o **objeto** (serviço a ser prestado)?',
    fields: ['objeto_servicos'],
    example: 'Exemplo: Desenvolvimento de sistema de gestão ERP',
  },
  {
    id: 'contrato_periodo',
    label: 'Período e Valores',
    question: '💰 Datas e valores do contrato:\n\n• **Data de início (DD/MM/AAAA):**\n• **Data de fim (DD/MM/AAAA):**\n• **Valor total (R$):**\n• **Forma de pagamento:**\n• **Dia de vencimento:**',
    fields: ['data_inicio', 'data_fim', 'valor_total', 'forma_pagamento', 'dia_pagamento'],
    example: 'Exemplo:\nInício: 01/07/2026\nFim: 31/12/2026\nValor: 50000\nPagamento: Mensal\nVencimento: 10',
  },
  {
    id: 'contrato_encerramento',
    label: 'Rescisão e Foro',
    question: '⚖️ Dados finais:\n\n• **Aviso prévio (em dias):**\n• **Cidade do foro:**\n• **Cidade de assinatura:**\n• **Data de assinatura (DD/MM/AAAA):**',
    fields: ['aviso_previo', 'foro_comarca', 'cidade_assinatura', 'data_assinatura'],
    example: 'Exemplo:\nAviso prévio: 30\nForo: São Paulo\nCidade de assinatura: São Paulo\nData de assinatura: 01/07/2026',
  },
];

// ============================================================
// PROPOSTA COMERCIAL
// ============================================================

const propostaSteps: WorkflowStep[] = [
  { field: 'empresa', question: 'Nome da empresa:', required: true, example: 'XPTO Ltda', validator: validators.nomeEmpresa },
  { field: 'cnpj', question: 'CNPJ (14 dígitos):', validator: validators.cnpj, required: true, example: '12345678000199', errorMessage: 'CNPJ deve ter 14 dígitos' },
  { field: 'valor', question: 'Valor total (R$):', validator: validators.valor, required: true, example: '5000', errorMessage: 'Informe apenas o número' },
  { field: 'prazo', question: 'Prazo de entrega:', required: true, example: '30 dias' },
  { field: 'responsavel', question: 'Responsável pela proposta:', required: true, example: 'João Silva' },
];

const propostaGroups: FieldGroup[] = [
  {
    id: 'proposta_dados',
    label: 'Dados da Proposta',
    question: '💼 Vamos criar sua **proposta comercial**.\n\nInforme: nome da empresa, CNPJ, valor total (R$), prazo de entrega e responsável.',
    fields: ['empresa', 'cnpj', 'valor', 'prazo', 'responsavel'],
    example: 'Exemplo: XPTO Ltda, CNPJ 12345678000199, valor R$ 5000, prazo 30 dias, responsável João Silva',
  },
];

// ============================================================
// RELATÓRIO FINAL
// ============================================================

const relatorioSteps: WorkflowStep[] = [
  { field: 'empresa', question: 'Nome da empresa:', required: true, example: 'XPTO Ltda', validator: validators.nomeEmpresa },
  { field: 'dataInicio', question: 'Data de início (DD/MM/AAAA):', validator: validators.data, required: true, example: '01/01/2026', errorMessage: 'Formato inválido. Use DD/MM/AAAA' },
  { field: 'dataFim', question: 'Data de fim (DD/MM/AAAA):', validator: validators.data, required: true, example: '30/06/2026', errorMessage: 'Formato inválido. Use DD/MM/AAAA' },
];

const relatorioGroups: FieldGroup[] = [
  {
    id: 'relatorio_dados',
    label: 'Dados do Relatório',
    question: '📊 Vamos criar seu **relatório**.\n\nInforme: nome da empresa, data de início e data de fim (DD/MM/AAAA).',
    fields: ['empresa', 'dataInicio', 'dataFim'],
    example: 'Exemplo: XPTO Ltda, de 01/01/2026 até 30/06/2026',
  },
];

// ============================================================
// ORÇAMENTO
// ============================================================

const orcamentoSteps: WorkflowStep[] = [
  { field: 'empresa', question: 'Nome da empresa:', required: true, example: 'XPTO Ltda', validator: validators.nomeEmpresa },
  { field: 'dataInicio', question: 'Data de início (DD/MM/AAAA):', validator: validators.data, required: true, example: '01/01/2026', errorMessage: 'Formato inválido. Use DD/MM/AAAA' },
  { field: 'dataFim', question: 'Data de fim (DD/MM/AAAA):', validator: validators.data, required: true, example: '30/06/2026', errorMessage: 'Formato inválido. Use DD/MM/AAAA' },
  { field: 'valor', question: 'Valor total (R$):', validator: validators.valor, required: true, example: '5000', errorMessage: 'Informe apenas o número' },
];

const orcamentoGroups: FieldGroup[] = [
  {
    id: 'orcamento_dados',
    label: 'Dados do Orçamento',
    question: '💰 Vamos criar seu **orçamento**.\n\nInforme: nome da empresa, data de início, data de fim (DD/MM/AAAA) e valor total.',
    fields: ['empresa', 'dataInicio', 'dataFim', 'valor'],
    example: 'Exemplo: XPTO Ltda, de 01/01/2026 até 30/06/2026, valor R$ 10000',
  },
];

// ---------- Exportação ----------

export const workflows: Record<string, WorkflowDefinition> = {
  contrato: { name: 'contrato', steps: contratoSteps, fieldGroups: contratoGroups },
  proposta_comercial: { name: 'proposta_comercial', steps: propostaSteps, fieldGroups: propostaGroups },
  relatorio_final: { name: 'relatorio_final', steps: relatorioSteps, fieldGroups: relatorioGroups },
  orcamento: { name: 'orcamento', steps: orcamentoSteps, fieldGroups: orcamentoGroups },
};

export const ALLOWED_DOCUMENT_TYPES = Object.keys(workflows) as readonly string[];
