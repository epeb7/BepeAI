import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Extrai um campo específico da mensagem do usuário.
 * Prioriza fallbacks manuais e usa IA apenas quando necessário.
 */
export async function extrairCampo(mensagem: string, campo: string): Promise<string | null> {
  let texto = mensagem.trim().replace(/\s+/g, ' ');

  // ========== FALLBACKS MANUAIS (mais confiáveis) ==========
  switch (campo) {
    case 'empresa':
    case 'contratante_empresa':
    case 'contratado_empresa':
      if (/^[A-Za-zÀ-ÿ\s]{2,}$/.test(texto) && !/\d/.test(texto)) return texto;
      break;
    case 'cnpj':
    case 'contratante_cnpj':
    case 'contratado_cnpj':
      const cnpjMatch = texto.match(/\d{14}/);
      if (cnpjMatch) return cnpjMatch[0];
      break;
    case 'cpf':
    case 'contratante_cpf':
    case 'contratado_cpf':
      const cpfMatch = texto.match(/\d{11}/);
      if (cpfMatch) return cpfMatch[0];
      break;
    case 'endereco':
    case 'contratante_endereco':
    case 'contratado_endereco':
      texto = texto.replace(/^(endereço|endereco):\s*/i, '');
      if (texto.length > 4) return texto;
      break;
    case 'data_inicio':
    case 'data_fim':
    case 'data_assinatura':
    case 'dataInicio':
    case 'dataFim':
      const dataMatch = texto.match(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/);
      if (dataMatch) return dataMatch[1];
      break;
    case 'valor_total':
    case 'valor':
      const valorMatch = texto.match(/(\d+(?:[.,]\d+)?)/);
      if (valorMatch) return valorMatch[1].replace(',', '.');
      break;
    case 'prazo':
    case 'aviso_previo':
      const prazoMatch = texto.match(/(\d+\s*(dia|dias|mês|meses|semana|semanas))/i);
      if (prazoMatch) return prazoMatch[1];
      break;
  }

  // ========== SE FALLBACK FALHOU, USA IA ==========
  const systemPrompt = `
Você é um extrator de dados objetivo. O usuário enviou: "${texto}"
Campo alvo: "${campo}"

REGRAS OBRIGATÓRIAS:
- Retorne APENAS o valor bruto, sem nenhuma palavra adicional.
- NÃO inclua frases como "Não consegui encontrar", "O valor é", etc.
- NÃO invente dados. Se não encontrar, retorne vazio.
- Para endereços, retorne o texto completo.
- Para datas, use formato DD/MM/AAAA.
- Para números, retorne apenas os dígitos (ex: 150000, não "150.000").
- Para CNPJ/CPF, apenas os números.

Exemplos:
Usuário: "av mauricio sirotski sobrinho,199" → "av mauricio sirotski sobrinho,199"
Usuário: "090897878" → "090897878"
Usuário: "O RG é 090897878" → "090897878"

Se não conseguir extrair, retorne uma linha em branco.
`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'system', content: systemPrompt }],
      model: 'llama-3.1-8b-instant',
      temperature: 0,
      max_tokens: 100,
    });
    let valor = completion.choices[0].message.content?.trim() || '';
    // Remove qualquer frase residual (ex: "O valor é: X")
    const matchLixo = valor.match(/(?::\s*)(.+)$/);
    if (matchLixo) valor = matchLixo[1];
    // Remove aspas e espaços extras
    valor = valor.replace(/^["']|["']$/g, '').trim();
    return valor || null;
  } catch (error) {
    console.error(`[Groq] Erro ao extrair ${campo}:`, error);
    return null;
  }
}