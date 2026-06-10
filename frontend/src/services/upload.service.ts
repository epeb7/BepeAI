import api from './api';

export interface UploadedFile {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  status: 'ready' | 'extract_failed';
  textPreview: string;
}

export const ACCEPTED_EXTENSIONS = [
  '.pdf', '.docx', '.txt', '.csv', '.json',
  '.js', '.ts', '.py', '.java', '.php', '.html', '.css', '.sql',
];

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export interface UploadResult {
  file: UploadedFile;
  conversationId: string | null;
}

// Envia um arquivo para o backend, associado à conversa atual.
// Retorna também o conversationId (criado pelo backend se ainda não existia).
export async function uploadFile(
  file: File,
  conversationId: string | null
): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  if (conversationId) form.append('conversationId', conversationId);

  const { data } = await api.post('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return { file: data.file as UploadedFile, conversationId: data.conversationId ?? conversationId };
}

export async function deleteUploadedFile(fileId: string): Promise<void> {
  await api.delete(`/upload/${fileId}`);
}

// Valida extensão e tamanho no cliente antes de enviar.
export function validateClientFile(file: File): string | null {
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    return `Tipo não suportado (${ext}). Aceitos: PDF, DOCX, TXT, CSV, JSON e código.`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'Arquivo excede o limite de 20 MB.';
  }
  if (file.size === 0) {
    return 'Arquivo vazio.';
  }
  return null;
}
