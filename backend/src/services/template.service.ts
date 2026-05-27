import fs from 'fs/promises';
import path from 'path';

export async function carregarTemplate(tipo: string): Promise<string> {
  const filePath = path.join(__dirname, '../templates', `${tipo}.txt`);
  return fs.readFile(filePath, 'utf-8');
}

export function preencherTemplate(template: string, dados: Record<string, string>): string {
  let resultado = template;
  for (const [chave, valor] of Object.entries(dados)) {
    resultado = resultado.replace(new RegExp(`{{${chave}}}`, 'g'), valor || '___________');
  }
  return resultado;
}