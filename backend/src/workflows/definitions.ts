// ============================================================
// definitions.ts - Workflows e tipos para geração de documentos
// ============================================================

// ---------- Tipos ----------
export interface WorkflowStep {
  field: string;
  question: string;
  validator?: (value: string) => boolean;
  errorMessage?: string;
  example?: string;
  required: boolean;
}

export interface WorkflowDefinition {
  name: string;
  steps: WorkflowStep[];
}

// ---------- Validadores reutilizáveis ----------
const validators = {
  cnpj: (v: string) => /^\d{14}$/.test(v),
  cpf: (v: string) => /^\d{11}$/.test(v),
  data: (v: string) => /^\d{2}\/\d{2}\/\d{4}$/.test(v),
  valor: (v: string) => /^\d+(?:[.,]\d+)?$/.test(v),
  nomeEmpresa: (v: string) => v.trim().length >= 2,
};

// ---------- Workflow: Contrato completo ----------
const contratoSteps: WorkflowStep[] = [
  // CONTRATANTE
  { field: 'contratante_empresa', question: 'Qual a razão social da empresa CONTRATANTE?', required: true, example: 'Empresa XPTO Ltda', validator: validators.nomeEmpresa, errorMessage: 'Nome inválido' },
  { field: 'contratante_cnpj', question: 'CNPJ da contratante (apenas números):', validator: validators.cnpj, required: true, example: '12345678000199', errorMessage: 'CNPJ deve ter 14 dígitos' },
  { field: 'contratante_endereco', question: 'Endereço completo da contratante:', required: true, example: 'Rua das Flores, 123' },
  { field: 'contratante_cidade', question: 'Cidade da contratante:', required: true, example: 'São Paulo' },
  { field: 'contratante_estado', question: 'Estado (sigla):', required: true, example: 'SP' },
  { field: 'contratante_cargo', question: 'Cargo do representante legal da contratante:', required: true, example: 'Diretor' },
  { field: 'contratante_nome', question: 'Nome completo do representante legal da contratante:', required: true, example: 'João Silva' },
  { field: 'contratante_nacionalidade', question: 'Nacionalidade do representante:', required: true, example: 'Brasileiro' },
  { field: 'contratante_estado_civil', question: 'Estado civil do representante:', required: true, example: 'Casado' },
  { field: 'contratante_profissao', question: 'Profissão do representante:', required: true, example: 'Empresário' },
  { field: 'contratante_rg', question: 'RG do representante (apenas números):', required: true, example: '123456789' },
  { field: 'contratante_cpf', question: 'CPF do representante (apenas números):', validator: validators.cpf, required: true, example: '12345678901', errorMessage: 'CPF deve ter 11 dígitos' },
  
  // CONTRATADO
  { field: 'contratado_empresa', question: 'Qual a razão social da empresa CONTRATADA?', required: true, example: 'Consultoria ABC Ltda', validator: validators.nomeEmpresa },
  { field: 'contratado_cnpj', question: 'CNPJ da contratada (apenas números):', validator: validators.cnpj, required: true, example: '98765432000188' },
  { field: 'contratado_endereco', question: 'Endereço completo da contratada:', required: true, example: 'Av. Paulista, 1000' },
  { field: 'contratado_cidade', question: 'Cidade da contratada:', required: true, example: 'São Paulo' },
  { field: 'contratado_estado', question: 'Estado (sigla):', required: true, example: 'SP' },
  { field: 'contratado_cargo', question: 'Cargo do representante legal da contratada:', required: true, example: 'Gerente' },
  { field: 'contratado_nome', question: 'Nome completo do representante legal da contratada:', required: true, example: 'Maria Santos' },
  { field: 'contratado_nacionalidade', question: 'Nacionalidade do representante:', required: true, example: 'Brasileira' },
  { field: 'contratado_estado_civil', question: 'Estado civil do representante:', required: true, example: 'Solteira' },
  { field: 'contratado_profissao', question: 'Profissão do representante:', required: true, example: 'Consultora' },
  { field: 'contratado_rg', question: 'RG do representante (apenas números):', required: true, example: '987654321' },
  { field: 'contratado_cpf', question: 'CPF do representante (apenas números):', validator: validators.cpf, required: true, example: '98765432100' },
  
  // CLÁUSULAS
  { field: 'objeto_servicos', question: 'Descreva detalhadamente o objeto do contrato (serviços a serem prestados):', required: true, example: 'Desenvolvimento de software' },
  { field: 'data_inicio', question: 'Data de início do contrato (DD/MM/AAAA):', validator: validators.data, required: true, example: '01/06/2026', errorMessage: 'Formato DD/MM/AAAA' },
  { field: 'data_fim', question: 'Data de término do contrato (DD/MM/AAAA):', validator: validators.data, required: true, example: '30/06/2026' },
  { field: 'valor_total', question: 'Valor total do contrato (R$):', validator: validators.valor, required: true, example: '10000' },
  { field: 'forma_pagamento', question: 'Forma de pagamento (ex: parcela única, mensal, etc.):', required: true, example: 'Mensal' },
  { field: 'dia_pagamento', question: 'Dia do vencimento (ex: 10):', required: true, example: '10' },
  { field: 'aviso_previo', question: 'Prazo de aviso prévio para rescisão (em dias):', required: true, example: '30' },
  { field: 'foro_comarca', question: 'Comarca para eleição de foro (cidade):', required: true, example: 'São Paulo' },
  { field: 'cidade_assinatura', question: 'Cidade onde será assinado o contrato:', required: true, example: 'São Paulo' },
  { field: 'data_assinatura', question: 'Data da assinatura (DD/MM/AAAA):', validator: validators.data, required: true, example: '01/06/2026' },
];

// ---------- Workflows simplificados para outros documentos ----------
const propostaSteps: WorkflowStep[] = [
  { field: 'empresa', question: 'Qual o nome da empresa?', required: true, example: 'XPTO' },
  { field: 'cnpj', question: 'CNPJ?', validator: validators.cnpj, required: true, example: '12345678000199' },
  { field: 'valor', question: 'Valor total?', validator: validators.valor, required: true, example: '5000' },
  { field: 'prazo', question: 'Prazo de entrega?', required: true, example: '30 dias' },
  { field: 'responsavel', question: 'Responsável?', required: true, example: 'João Silva' },
];

const relatorioSteps: WorkflowStep[] = [
  { field: 'empresa', question: 'Empresa?', required: true },
  { field: 'dataInicio', question: 'Data início?', validator: validators.data, required: true, example: '01/06/2026' },
  { field: 'dataFim', question: 'Data fim?', validator: validators.data, required: true, example: '30/06/2026' },
];

const orcamentoSteps: WorkflowStep[] = [
  { field: 'empresa', question: 'Empresa?', required: true },
  { field: 'dataInicio', question: 'Data início?', validator: validators.data, required: true, example: '01/06/2026' },
  { field: 'dataFim', question: 'Data fim?', validator: validators.data, required: true, example: '30/06/2026' },
  { field: 'valor', question: 'Valor?', validator: validators.valor, required: true, example: '5000' },
];

// ---------- Exportação dos workflows ----------
export const workflows: Record<string, WorkflowDefinition> = {
  contrato: { name: 'contrato', steps: contratoSteps },
  proposta_comercial: { name: 'proposta_comercial', steps: propostaSteps },
  relatorio_final: { name: 'relatorio_final', steps: relatorioSteps },
  orcamento: { name: 'orcamento', steps: orcamentoSteps },
};