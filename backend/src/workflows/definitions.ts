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
    question: '🏢 Vamos começar pelos dados da empresa **CONTRATANTE** — quem está contratando o serviço.\n\nEssas informações identificam legalmente a empresa no contrato. O CNPJ pode ser informado com ou sem pontuação.\n\n• **Razão social:** (nome jurídico da empresa, não o nome fantasia)\n• **CNPJ:** (14 dígitos)\n• **Endereço:** (logradouro, número e complemento)\n• **Cidade:**\n• **Estado:** (sigla, ex: SP)',
    fields: ['contratante_empresa', 'contratante_cnpj', 'contratante_endereco', 'contratante_cidade', 'contratante_estado'],
    example: 'Exemplo:\nRazão social: Tech Soluções Ltda\nCNPJ: 12.345.678/0001-99\nEndereço: Rua das Flores, 123\nCidade: São Paulo\nEstado: SP',
  },
  {
    id: 'contratante_rep',
    label: 'Representante da Contratante',
    question: '👤 Agora os dados do **representante legal** da Contratante — a pessoa física que assina pelo CNPJ.\n\nO RG e CPF identificam o signatário e são obrigatórios para validade do documento. O estado civil e a profissão constam por exigência do Código Civil para contratos entre pessoas jurídicas.\n\n• **Cargo:** (ex: Diretor, Sócio-Administrador, CEO)\n• **Nome completo:**\n• **Nacionalidade:** (ex: Brasileiro)\n• **Estado civil:** (ex: Casado, Solteiro)\n• **Profissão:** (ex: Empresário, Engenheiro)\n• **RG:** (somente números)\n• **CPF:** (11 dígitos)',
    fields: ['contratante_cargo', 'contratante_nome', 'contratante_nacionalidade', 'contratante_estado_civil', 'contratante_profissao', 'contratante_rg', 'contratante_cpf'],
    example: 'Exemplo:\nCargo: Diretor\nNome: João Silva\nNacionalidade: Brasileiro\nEstado civil: Casado\nProfissão: Empresário\nRG: 123456789\nCPF: 123.456.789-01',
  },
  {
    id: 'contratado_dados',
    label: 'Dados da Contratada',
    question: '🏢 Agora os dados da empresa **CONTRATADA** — quem irá prestar o serviço.\n\nMesmo padrão da etapa anterior. O endereço define a praça de atuação e é referência para notificações contratuais.\n\n• **Razão social:**\n• **CNPJ:** (14 dígitos, com ou sem pontuação)\n• **Endereço:** (logradouro, número e complemento)\n• **Cidade:**\n• **Estado:** (sigla)',
    fields: ['contratado_empresa', 'contratado_cnpj', 'contratado_endereco', 'contratado_cidade', 'contratado_estado'],
    example: 'Exemplo:\nRazão social: Consultoria ABC Ltda\nCNPJ: 98.765.432/0001-88\nEndereço: Av. Paulista, 1000\nCidade: São Paulo\nEstado: SP',
  },
  {
    id: 'contratado_rep',
    label: 'Representante da Contratada',
    question: '👤 Representante legal da **CONTRATADA** — a pessoa que assina pelo prestador de serviços.\n\n• **Cargo:**\n• **Nome completo:**\n• **Nacionalidade:**\n• **Estado civil:**\n• **Profissão:**\n• **RG:** (somente números)\n• **CPF:** (11 dígitos)',
    fields: ['contratado_cargo', 'contratado_nome', 'contratado_nacionalidade', 'contratado_estado_civil', 'contratado_profissao', 'contratado_rg', 'contratado_cpf'],
    example: 'Exemplo:\nCargo: Gerente\nNome: Maria Santos\nNacionalidade: Brasileira\nEstado civil: Solteira\nProfissão: Consultora\nRG: 987654321\nCPF: 987.654.321-00',
  },
  {
    id: 'contrato_objeto',
    label: 'Objeto do Contrato',
    question: '📋 Qual é o **objeto do contrato** — o serviço que será prestado?\n\nEsta é a cláusula mais importante: define exatamente o que foi acordado. Seja específico — descrições vagas como "consultoria" ou "serviços de TI" geram disputas em caso de conflito.\n\n**Descreva o serviço com clareza:**',
    fields: ['objeto_servicos'],
    example: 'Exemplo: Desenvolvimento de sistema web de gestão financeira, incluindo módulos de contas a pagar, contas a receber, fluxo de caixa e relatórios gerenciais.',
  },
  {
    id: 'contrato_periodo',
    label: 'Período e Valores',
    question: '💰 Datas e condições financeiras do contrato.\n\nUse o formato DD/MM/AAAA para as datas. O valor deve ser informado apenas como número (ex: 50000 para R$ 50.000,00).\n\n• **Data de início:** (DD/MM/AAAA)\n• **Data de término:** (DD/MM/AAAA)\n• **Valor total:** (R$ — somente o número)\n• **Forma de pagamento:** (ex: Mensal, Parcelado em 3x, 50% entrada)\n• **Dia de vencimento:** (dia do mês, ex: 10)',
    fields: ['data_inicio', 'data_fim', 'valor_total', 'forma_pagamento', 'dia_pagamento'],
    example: 'Exemplo:\nInício: 01/07/2026\nTérmino: 31/12/2026\nValor: 50000\nPagamento: Mensal\nVencimento: 10',
  },
  {
    id: 'contrato_encerramento',
    label: 'Rescisão e Foro',
    question: '⚖️ Última etapa — dados de rescisão e foro judicial.\n\nO **aviso prévio** é o número de dias que qualquer parte precisa notificar a outra antes de rescindir (padrão de mercado: 30 dias). O **foro** define em qual cidade serão julgadas eventuais disputas — normalmente a cidade da contratante.\n\n• **Aviso prévio:** (dias — ex: 30)\n• **Cidade do foro:** (ex: São Paulo)\n• **Cidade de assinatura:**\n• **Data de assinatura:** (DD/MM/AAAA)',
    fields: ['aviso_previo', 'foro_comarca', 'cidade_assinatura', 'data_assinatura'],
    example: 'Exemplo:\nAviso prévio: 30\nForo: São Paulo\nCidade: São Paulo\nData: 01/07/2026',
  },
];

// ============================================================
// PROPOSTA COMERCIAL
// 18 campos → 4 grupos
// ============================================================

const propostaSteps: WorkflowStep[] = [
  // Emitente
  { field: 'emitente_empresa',    label: 'Empresa emitente',    question: 'Razão social da empresa que emite a proposta:', required: true, example: 'Consultoria ABC Ltda', validator: validators.nomeEmpresa },
  { field: 'emitente_cnpj',       label: 'CNPJ do emitente',    question: 'CNPJ do emitente (14 dígitos):', validator: validators.cnpj, required: true, example: '12345678000199', errorMessage: 'CNPJ deve ter 14 dígitos' },
  { field: 'emitente_endereco',   label: 'Endereço do emitente', question: 'Endereço completo do emitente:', required: true, example: 'Av. Paulista, 1000, São Paulo - SP' },
  { field: 'emitente_responsavel', label: 'Responsável',        question: 'Nome do responsável pela proposta:', required: true, example: 'João Silva' },
  { field: 'emitente_cargo',      label: 'Cargo',               question: 'Cargo do responsável:', required: true, example: 'Diretor Comercial' },
  { field: 'emitente_email',      label: 'E-mail',              question: 'E-mail de contato:', required: true, example: 'joao@consultoriaabc.com.br' },
  { field: 'emitente_telefone',   label: 'Telefone',            question: 'Telefone de contato:', required: true, example: '(11) 99999-0000' },
  // Cliente
  { field: 'cliente_empresa',     label: 'Empresa cliente',     question: 'Razão social da empresa cliente:', required: true, example: 'Tech Soluções Ltda', validator: validators.nomeEmpresa },
  { field: 'cliente_cnpj',        label: 'CNPJ do cliente',     question: 'CNPJ do cliente (14 dígitos):', validator: validators.cnpj, required: true, example: '98765432000188', errorMessage: 'CNPJ deve ter 14 dígitos' },
  { field: 'cliente_responsavel', label: 'Contato no cliente',  question: 'Nome do responsável no cliente:', required: true, example: 'Maria Oliveira' },
  // Proposta
  { field: 'descricao_servicos',  label: 'Descrição dos serviços', question: 'Descreva os serviços propostos:', required: true, example: 'Desenvolvimento de sistema web e aplicativo mobile' },
  { field: 'escopo_detalhado',    label: 'Escopo detalhado',    question: 'Liste as entregas incluídas no escopo:', required: true, example: 'Levantamento de requisitos, design UX/UI, desenvolvimento backend e frontend, testes e deploy' },
  { field: 'valor_total',         label: 'Valor total',         question: 'Valor total da proposta (R$):', validator: validators.valor, required: true, example: '25000', errorMessage: 'Informe apenas o número' },
  { field: 'forma_pagamento',     label: 'Forma de pagamento',  question: 'Forma de pagamento:', required: true, example: '50% na assinatura, 50% na entrega' },
  { field: 'prazo_entrega',       label: 'Prazo de entrega',    question: 'Prazo estimado de entrega:', required: true, example: '60 dias corridos após assinatura' },
  { field: 'validade_proposta',   label: 'Validade da proposta', question: 'Validade desta proposta (em dias):', required: true, example: '30' },
  { field: 'cidade_emissao',      label: 'Cidade de emissão',   question: 'Cidade de emissão da proposta:', required: true, example: 'São Paulo' },
  { field: 'data_emissao',        label: 'Data de emissão',     question: 'Data de emissão (DD/MM/AAAA):', validator: validators.data, required: true, example: '01/07/2026', errorMessage: 'Formato inválido. Use DD/MM/AAAA' },
];

const propostaGroups: FieldGroup[] = [
  {
    id: 'proposta_emitente',
    label: 'Dados do Emitente',
    question: '🏢 Dados da empresa que está **enviando** a proposta — seu negócio.\n\nEssas informações aparecem no cabeçalho da proposta e identificam formalmente quem está fazendo a oferta comercial.\n\n• **Razão social:** (nome jurídico)\n• **CNPJ:** (14 dígitos, com ou sem pontuação)\n• **Endereço:** (completo, com cidade e estado)\n• **Responsável:** (nome de quem assina)\n• **Cargo:** (ex: Diretor Comercial, Sócio)\n• **E-mail:** (para contato e aceite)\n• **Telefone:**',
    fields: ['emitente_empresa', 'emitente_cnpj', 'emitente_endereco', 'emitente_responsavel', 'emitente_cargo', 'emitente_email', 'emitente_telefone'],
    example: 'Exemplo:\nRazão social: Consultoria ABC Ltda\nCNPJ: 12.345.678/0001-99\nEndereço: Av. Paulista, 1000, São Paulo - SP\nResponsável: João Silva\nCargo: Diretor Comercial\nE-mail: joao@consultoriaabc.com.br\nTelefone: (11) 99999-0000',
  },
  {
    id: 'proposta_cliente',
    label: 'Dados do Cliente',
    question: '👤 Dados do **cliente** que receberá a proposta.\n\nO CNPJ do cliente vincula juridicamente a proposta a uma empresa específica, evitando confusão em caso de grupos empresariais. O responsável é a pessoa que irá assinar o aceite.\n\n• **Razão social:**\n• **CNPJ:** (14 dígitos)\n• **Nome do responsável:** (quem irá assinar)',
    fields: ['cliente_empresa', 'cliente_cnpj', 'cliente_responsavel'],
    example: 'Exemplo:\nRazão social: Tech Soluções Ltda\nCNPJ: 98.765.432/0001-88\nResponsável: Maria Oliveira',
  },
  {
    id: 'proposta_escopo',
    label: 'Escopo e Serviços',
    question: '📋 O coração da proposta — o que está sendo oferecido.\n\nA **descrição** é o resumo executivo (o que você vai entregar). O **escopo detalhado** lista as entregas concretas — isso protege você de solicitações fora do acordado ("não estava no escopo").\n\n• **Descrição dos serviços:** (resumo em 1–2 frases)\n• **Escopo detalhado:** (liste as entregas incluídas)',
    fields: ['descricao_servicos', 'escopo_detalhado'],
    example: 'Exemplo:\nDescrição: Desenvolvimento de sistema web e aplicativo mobile para gestão de pedidos\nEscopo: Levantamento de requisitos, design UX/UI, desenvolvimento backend (Node.js) e frontend (React), testes automatizados e deploy em produção',
  },
  {
    id: 'proposta_financeiro',
    label: 'Valores e Condições',
    question: '💰 Condições comerciais e financeiras.\n\nA **validade** define até quando esses preços e condições são garantidos — após esse prazo você pode reajustar. O valor deve ser informado apenas como número.\n\n• **Valor total:** (R$ — somente o número, ex: 25000)\n• **Forma de pagamento:** (ex: 50% na assinatura, 50% na entrega)\n• **Prazo de entrega:** (ex: 60 dias corridos após assinatura)\n• **Validade da proposta:** (dias — ex: 30)\n• **Cidade de emissão:**\n• **Data de emissão:** (DD/MM/AAAA)',
    fields: ['valor_total', 'forma_pagamento', 'prazo_entrega', 'validade_proposta', 'cidade_emissao', 'data_emissao'],
    example: 'Exemplo:\nValor: 25000\nPagamento: 50% na assinatura, 50% na entrega\nPrazo: 60 dias corridos após assinatura\nValidade: 30\nCidade: São Paulo\nData: 01/07/2026',
  },
];

// ============================================================
// ORÇAMENTO
// 14 campos → 3 grupos
// ============================================================

const orcamentoSteps: WorkflowStep[] = [
  // Emitente
  { field: 'empresa_emitente',    label: 'Empresa emitente',    question: 'Razão social da empresa emissora:', required: true, example: 'Serviços Técnicos Ltda', validator: validators.nomeEmpresa },
  { field: 'cnpj_emitente',       label: 'CNPJ do emitente',   question: 'CNPJ do emitente (14 dígitos):', validator: validators.cnpj, required: true, example: '12345678000199', errorMessage: 'CNPJ deve ter 14 dígitos' },
  { field: 'responsavel_emitente', label: 'Responsável',        question: 'Responsável pela emissão:', required: true, example: 'Carlos Almeida' },
  { field: 'telefone_emitente',   label: 'Telefone',            question: 'Telefone para contato:', required: true, example: '(11) 3000-0000' },
  // Cliente/Solicitante
  { field: 'cliente_nome',        label: 'Cliente/Solicitante', question: 'Nome ou razão social do solicitante:', required: true, example: 'Empresa Compradora Ltda' },
  { field: 'cliente_cnpj_cpf',    label: 'CNPJ ou CPF',        question: 'CNPJ ou CPF do solicitante:', required: true, example: '98765432000188' },
  // Itens
  { field: 'descricao_itens',     label: 'Descrição dos itens', question: 'Descreva os produtos/serviços do orçamento:', required: true, example: 'Instalação elétrica industrial — 200m²' },
  { field: 'quantidade_unidade',  label: 'Quantidade/Unidade', question: 'Quantidade e unidade de medida:', required: true, example: '1 projeto completo' },
  { field: 'valor_unitario',      label: 'Valor unitário',     question: 'Valor unitário (R$):', validator: validators.valor, required: true, example: '8000', errorMessage: 'Informe apenas o número' },
  { field: 'valor_total',         label: 'Valor total',        question: 'Valor total do orçamento (R$):', validator: validators.valor, required: true, example: '8000', errorMessage: 'Informe apenas o número' },
  // Condições
  { field: 'forma_pagamento',     label: 'Forma de pagamento', question: 'Forma de pagamento:', required: true, example: 'À vista com 5% de desconto ou 3× sem juros' },
  { field: 'prazo_execucao',      label: 'Prazo de execução',  question: 'Prazo para execução/entrega:', required: true, example: '15 dias úteis' },
  { field: 'validade_orcamento',  label: 'Validade',           question: 'Validade deste orçamento (em dias):', required: true, example: '15' },
  { field: 'data_emissao',        label: 'Data de emissão',    question: 'Data de emissão (DD/MM/AAAA):', validator: validators.data, required: true, example: '01/07/2026', errorMessage: 'Formato inválido. Use DD/MM/AAAA' },
];

const orcamentoGroups: FieldGroup[] = [
  {
    id: 'orcamento_emitente',
    label: 'Dados do Emitente',
    question: '🏢 Dados da empresa que está **emitindo** o orçamento.\n\nO orçamento é um documento comercial formal — identifica quem está fazendo a oferta de preços. O telefone é obrigatório para que o solicitante possa confirmar condições.\n\n• **Razão social:** (nome jurídico da empresa)\n• **CNPJ:** (14 dígitos, com ou sem pontuação)\n• **Responsável:** (nome de quem emite)\n• **Telefone:** (para contato)',
    fields: ['empresa_emitente', 'cnpj_emitente', 'responsavel_emitente', 'telefone_emitente'],
    example: 'Exemplo:\nRazão social: Serviços Técnicos Ltda\nCNPJ: 12.345.678/0001-99\nResponsável: Carlos Almeida\nTelefone: (11) 3000-0000',
  },
  {
    id: 'orcamento_cliente',
    label: 'Solicitante e Itens',
    question: '📦 Dados do **solicitante** e composição de valores.\n\nO solicitante pode ser pessoa física (CPF — 11 dígitos) ou jurídica (CNPJ — 14 dígitos). O valor unitário multiplicado pela quantidade deve resultar no valor total.\n\n• **Nome ou Razão social do solicitante:**\n• **CNPJ ou CPF:** (sem pontuação)\n• **Descrição dos itens/serviços:**\n• **Quantidade e unidade:** (ex: 2 unidades, 1 projeto)\n• **Valor unitário:** (R$ — somente o número)\n• **Valor total:** (R$ — somente o número)',
    fields: ['cliente_nome', 'cliente_cnpj_cpf', 'descricao_itens', 'quantidade_unidade', 'valor_unitario', 'valor_total'],
    example: 'Exemplo:\nSolicitante: Empresa Compradora Ltda\nCNPJ: 98765432000188\nDescrição: Instalação elétrica industrial — 200m²\nQuantidade: 1 projeto completo\nValor unitário: 8000\nValor total: 8000',
  },
  {
    id: 'orcamento_condicoes',
    label: 'Condições Comerciais',
    question: '💰 Condições de pagamento, prazo e validade.\n\nA **validade** protege você de orçamentos usados muito depois da emissão — após o prazo, os preços podem ser revistos. O prazo de execução começa a contar a partir do aceite e pagamento inicial.\n\n• **Forma de pagamento:** (ex: À vista, 3× sem juros, 50% entrada)\n• **Prazo de execução/entrega:** (ex: 15 dias úteis)\n• **Validade deste orçamento:** (dias — ex: 15)\n• **Data de emissão:** (DD/MM/AAAA)',
    fields: ['forma_pagamento', 'prazo_execucao', 'validade_orcamento', 'data_emissao'],
    example: 'Exemplo:\nPagamento: À vista com 5% de desconto ou 3× sem juros\nPrazo: 15 dias úteis\nValidade: 15\nData: 01/07/2026',
  },
];

// ============================================================
// RELATÓRIO FINAL
// 10 campos → 3 grupos
// ============================================================

const relatorioSteps: WorkflowStep[] = [
  { field: 'empresa',            label: 'Empresa',           question: 'Razão social da empresa:', required: true, example: 'XPTO Ltda', validator: validators.nomeEmpresa },
  { field: 'cnpj',               label: 'CNPJ',              question: 'CNPJ da empresa (14 dígitos):', validator: validators.cnpj, required: true, example: '12345678000199', errorMessage: 'CNPJ deve ter 14 dígitos' },
  { field: 'responsavel',        label: 'Responsável',       question: 'Nome do responsável pelo relatório:', required: true, example: 'Ana Costa' },
  { field: 'cargo_responsavel',  label: 'Cargo',             question: 'Cargo do responsável:', required: true, example: 'Gerente de Projetos' },
  { field: 'titulo_relatorio',   label: 'Título',            question: 'Título do relatório:', required: true, example: 'Relatório de Desempenho Semestral 2026' },
  { field: 'data_inicio',        label: 'Data de início',    question: 'Data de início do período (DD/MM/AAAA):', validator: validators.data, required: true, example: '01/01/2026', errorMessage: 'Formato inválido. Use DD/MM/AAAA' },
  { field: 'data_fim',           label: 'Data de fim',       question: 'Data de fim do período (DD/MM/AAAA):', validator: validators.data, required: true, example: '30/06/2026', errorMessage: 'Formato inválido. Use DD/MM/AAAA' },
  { field: 'resumo_executivo',   label: 'Resumo executivo',  question: 'Escreva um resumo executivo do período:', required: true, example: 'O semestre foi marcado por crescimento de 18% em receita e expansão para dois novos estados.' },
  { field: 'principais_resultados', label: 'Principais resultados', question: 'Liste os principais resultados alcançados:', required: true, example: 'Entrega de 3 projetos estratégicos; redução de 12% nos custos operacionais; 98% de satisfação dos clientes' },
  { field: 'recomendacoes',      label: 'Recomendações',     question: 'Quais são as recomendações para o próximo período?', required: true, example: 'Ampliar equipe de vendas, investir em automação de processos internos e expandir para o segmento enterprise.' },
];

const relatorioGroups: FieldGroup[] = [
  {
    id: 'relatorio_empresa',
    label: 'Identificação',
    question: '🏢 Identificação formal do relatório.\n\nO título é importante para classificação e recuperação do documento em auditorias — seja descritivo (inclua o período e o tema). O cargo do responsável define a autoridade que valida as informações.\n\n• **Razão social:** (empresa que elabora o relatório)\n• **CNPJ:** (14 dígitos)\n• **Responsável:** (quem elaborou ou assina)\n• **Cargo:** (ex: Gerente de Projetos, Diretor Financeiro)\n• **Título do relatório:** (descritivo, ex: Relatório de Desempenho Semestral 2026)',
    fields: ['empresa', 'cnpj', 'responsavel', 'cargo_responsavel', 'titulo_relatorio'],
    example: 'Exemplo:\nRazão social: XPTO Ltda\nCNPJ: 12.345.678/0001-99\nResponsável: Ana Costa\nCargo: Gerente de Projetos\nTítulo: Relatório de Desempenho Semestral 2026',
  },
  {
    id: 'relatorio_periodo',
    label: 'Período e Resultados',
    question: '📊 Período analisado e resultados do relatório.\n\nO **resumo executivo** é lido pela diretoria — deve ser objetivo e destacar os pontos mais relevantes. Os **principais resultados** são os dados concretos (números, metas, entregas).\n\n• **Data de início do período:** (DD/MM/AAAA)\n• **Data de fim do período:** (DD/MM/AAAA)\n• **Resumo executivo:** (visão geral em 2–4 frases)\n• **Principais resultados:** (liste os resultados com dados objetivos)',
    fields: ['data_inicio', 'data_fim', 'resumo_executivo', 'principais_resultados'],
    example: 'Exemplo:\nInício: 01/01/2026\nFim: 30/06/2026\nResumo: O semestre foi marcado por crescimento de 18% em receita e expansão para dois novos estados.\nResultados: Entrega de 3 projetos estratégicos; redução de 12% nos custos operacionais; 98% de satisfação dos clientes.',
  },
  {
    id: 'relatorio_recomendacoes',
    label: 'Recomendações',
    question: '💡 Recomendações para o próximo período.\n\nAs recomendações transformam o relatório em instrumento de gestão — não apenas registra o passado, mas orienta o futuro. Seja específico nas ações sugeridas.\n\n**Descreva as recomendações e diretrizes para o próximo ciclo:**',
    fields: ['recomendacoes'],
    example: 'Exemplo: Ampliar equipe de vendas em 2 profissionais, investir em automação de processos de faturamento e expandir atuação para o segmento enterprise com foco em contratos anuais.',
  },
];

// ============================================================
// NDA — ACORDO DE CONFIDENCIALIDADE
// 20 campos → 4 grupos
// ============================================================

const ndaSteps: WorkflowStep[] = [
  // Parte Divulgadora
  { field: 'divulgadora_empresa',      label: 'Empresa divulgadora',    question: 'Razão social da parte que divulga as informações:', required: true, example: 'StartupX Tecnologia Ltda', validator: validators.nomeEmpresa },
  { field: 'divulgadora_cnpj',         label: 'CNPJ da divulgadora',   question: 'CNPJ da parte divulgadora (14 dígitos):', validator: validators.cnpj, required: true, example: '12345678000199', errorMessage: 'CNPJ deve ter 14 dígitos' },
  { field: 'divulgadora_endereco',     label: 'Endereço',              question: 'Endereço completo da parte divulgadora:', required: true, example: 'Rua Inovação, 500, São Paulo - SP' },
  { field: 'divulgadora_representante', label: 'Representante',        question: 'Nome do representante legal da parte divulgadora:', required: true, example: 'Ricardo Mendes' },
  { field: 'divulgadora_cargo',        label: 'Cargo',                 question: 'Cargo do representante:', required: true, example: 'CEO' },
  { field: 'divulgadora_cpf',          label: 'CPF do representante',  question: 'CPF do representante (11 dígitos):', validator: validators.cpf, required: true, example: '12345678901', errorMessage: 'CPF deve ter 11 dígitos' },
  // Parte Receptora
  { field: 'receptora_empresa',        label: 'Empresa receptora',     question: 'Razão social da parte que recebe as informações:', required: true, example: 'Investidores XYZ Ltda', validator: validators.nomeEmpresa },
  { field: 'receptora_cnpj',           label: 'CNPJ da receptora',     question: 'CNPJ da parte receptora (14 dígitos):', validator: validators.cnpj, required: true, example: '98765432000188', errorMessage: 'CNPJ deve ter 14 dígitos' },
  { field: 'receptora_endereco',       label: 'Endereço',              question: 'Endereço completo da parte receptora:', required: true, example: 'Av. Faria Lima, 2000, São Paulo - SP' },
  { field: 'receptora_representante',  label: 'Representante',         question: 'Nome do representante legal da parte receptora:', required: true, example: 'Fernanda Lima' },
  { field: 'receptora_cargo',          label: 'Cargo',                 question: 'Cargo do representante:', required: true, example: 'Diretora de Investimentos' },
  { field: 'receptora_cpf',            label: 'CPF do representante',  question: 'CPF do representante (11 dígitos):', validator: validators.cpf, required: true, example: '98765432100', errorMessage: 'CPF deve ter 11 dígitos' },
  // Objeto
  { field: 'finalidade_nda',           label: 'Finalidade',            question: 'Qual a finalidade da divulgação das informações?', required: true, example: 'Avaliação de oportunidade de investimento na empresa StartupX' },
  { field: 'descricao_informacoes',    label: 'Informações confidenciais', question: 'Descreva o tipo de informação confidencial a ser protegida:', required: true, example: 'Dados financeiros, planos de negócios, tecnologia proprietária, base de clientes e roadmap de produto' },
  { field: 'prazo_confidencialidade',  label: 'Prazo de sigilo (anos)', question: 'Por quantos anos as informações devem ser mantidas em sigilo?', required: true, example: '5' },
  // Vigência e Foro
  { field: 'vigencia_meses',           label: 'Vigência (meses)',       question: 'Vigência deste acordo em meses:', required: true, example: '24' },
  { field: 'penalidade_valor',         label: 'Penalidade por violação', question: 'Valor da multa por violação (R$):', validator: validators.valor, required: true, example: '100000', errorMessage: 'Informe apenas o número' },
  { field: 'foro_comarca',             label: 'Foro',                   question: 'Cidade do foro para resolução de litígios:', required: true, example: 'São Paulo' },
  { field: 'cidade_assinatura',        label: 'Cidade de assinatura',   question: 'Cidade de assinatura do acordo:', required: true, example: 'São Paulo' },
  { field: 'data_assinatura',          label: 'Data de assinatura',     question: 'Data de assinatura (DD/MM/AAAA):', validator: validators.data, required: true, example: '01/07/2026', errorMessage: 'Formato inválido. Use DD/MM/AAAA' },
];

const ndaGroups: FieldGroup[] = [
  {
    id: 'nda_divulgadora',
    label: 'Parte Divulgadora',
    question: '🔐 Dados da **Parte Divulgadora** — a empresa que possui as informações e irá compartilhá-las.\n\nNo NDA, a Divulgadora é quem tem o segredo a proteger. O CPF do representante identifica a pessoa física responsável pelo compromisso de sigilo.\n\n• **Razão social:**\n• **CNPJ:** (14 dígitos)\n• **Endereço:** (completo)\n• **Representante:** (nome do signatário)\n• **Cargo:** (ex: CEO, Diretor)\n• **CPF do representante:** (11 dígitos)',
    fields: ['divulgadora_empresa', 'divulgadora_cnpj', 'divulgadora_endereco', 'divulgadora_representante', 'divulgadora_cargo', 'divulgadora_cpf'],
    example: 'Exemplo:\nRazão social: StartupX Tecnologia Ltda\nCNPJ: 12.345.678/0001-99\nEndereço: Rua Inovação, 500, São Paulo - SP\nRepresentante: Ricardo Mendes\nCargo: CEO\nCPF: 123.456.789-01',
  },
  {
    id: 'nda_receptora',
    label: 'Parte Receptora',
    question: '👤 Dados da **Parte Receptora** — a empresa que irá receber e manter em sigilo as informações.\n\nA Receptora assume as obrigações de confidencialidade. O endereço é necessário para notificações formais em caso de violação.\n\n• **Razão social:**\n• **CNPJ:** (14 dígitos)\n• **Endereço:** (completo)\n• **Representante:** (nome do signatário)\n• **Cargo:**\n• **CPF do representante:** (11 dígitos)',
    fields: ['receptora_empresa', 'receptora_cnpj', 'receptora_endereco', 'receptora_representante', 'receptora_cargo', 'receptora_cpf'],
    example: 'Exemplo:\nRazão social: Investidores XYZ Ltda\nCNPJ: 98.765.432/0001-88\nEndereço: Av. Faria Lima, 2000, São Paulo - SP\nRepresentante: Fernanda Lima\nCargo: Diretora de Investimentos\nCPF: 987.654.321-00',
  },
  {
    id: 'nda_objeto',
    label: 'Finalidade e Informações Protegidas',
    question: '📄 O que este NDA está protegendo e por quê.\n\nA **finalidade** delimita o uso das informações — só podem ser usadas para o fim declarado aqui. O **prazo de sigilo** continua válido mesmo após o NDA encerrar (padrão de mercado: 2 a 5 anos).\n\n• **Finalidade da divulgação:** (ex: avaliação de investimento, parceria comercial)\n• **Informações confidenciais:** (descreva os tipos, ex: dados financeiros, tecnologia, clientes)\n• **Prazo de sigilo após encerramento:** (anos — ex: 3)',
    fields: ['finalidade_nda', 'descricao_informacoes', 'prazo_confidencialidade'],
    example: 'Exemplo:\nFinalidade: Avaliação de oportunidade de investimento na empresa StartupX\nInformações: Dados financeiros, planos de negócios, tecnologia proprietária, base de clientes e roadmap de produto\nPrazo de sigilo: 5',
  },
  {
    id: 'nda_vigencia',
    label: 'Vigência e Penalidades',
    question: '⚖️ Duração do NDA, multa por violação e foro.\n\nA **vigência** é o tempo que o NDA fica ativo (ex: durante uma negociação). A **multa** deve ser alta o suficiente para ser dissuasiva — entre 10% e 50% do valor do negócio envolvido é padrão. O **foro** define onde serão julgadas disputas.\n\n• **Vigência do acordo:** (meses — ex: 24)\n• **Multa por violação:** (R$ — somente o número, ex: 100000)\n• **Cidade do foro:** (ex: São Paulo)\n• **Cidade de assinatura:**\n• **Data de assinatura:** (DD/MM/AAAA)',
    fields: ['vigencia_meses', 'penalidade_valor', 'foro_comarca', 'cidade_assinatura', 'data_assinatura'],
    example: 'Exemplo:\nVigência: 24\nMulta: 100000\nForo: São Paulo\nCidade: São Paulo\nData: 01/07/2026',
  },
];

// ---------- Exportação ----------

export const workflows: Record<string, WorkflowDefinition> = {
  contrato:           { name: 'contrato',           steps: contratoSteps,  fieldGroups: contratoGroups  },
  proposta_comercial: { name: 'proposta_comercial',  steps: propostaSteps,  fieldGroups: propostaGroups  },
  orcamento:          { name: 'orcamento',           steps: orcamentoSteps, fieldGroups: orcamentoGroups },
  relatorio_final:    { name: 'relatorio_final',     steps: relatorioSteps, fieldGroups: relatorioGroups },
  nda:                { name: 'nda',                 steps: ndaSteps,       fieldGroups: ndaGroups       },
};

export const ALLOWED_DOCUMENT_TYPES = Object.keys(workflows) as readonly string[];
