/**
 * file.service.ts — Upload de arquivos (Fase 1).
 *
 * Fluxo síncrono: valida → extrai texto → envia ao Supabase Storage →
 * persiste metadados + texto extraído na tabela `files`.
 *
 * Sem filas, sem embeddings, sem OCR (Fase 1).
 */

import { PDFParse } from 'pdf-parse';
import * as mammoth from 'mammoth';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import logger from '../lib/logger';

const BUCKET = 'uploads';
export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// Limite de texto extraído enviado ao prompt do Groq (evita estourar contexto).
const MAX_EXTRACTED_CHARS = 12_000;

// ── Tipos aceitos: extensão → MIME esperados ──────────────────
const ALLOWED: Record<string, string[]> = {
  pdf:  ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/octet-stream'],
  txt:  ['text/plain', 'application/octet-stream'],
  csv:  ['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/octet-stream'],
  json: ['application/json', 'text/plain', 'application/octet-stream'],
  js:   ['text/javascript', 'application/javascript', 'text/plain', 'application/octet-stream'],
  ts:   ['text/plain', 'application/typescript', 'video/mp2t', 'application/octet-stream'],
  py:   ['text/x-python', 'text/plain', 'application/octet-stream'],
  java: ['text/x-java-source', 'text/plain', 'application/octet-stream'],
  php:  ['application/x-php', 'text/plain', 'application/octet-stream'],
  html: ['text/html', 'text/plain', 'application/octet-stream'],
  css:  ['text/css', 'text/plain', 'application/octet-stream'],
  sql:  ['application/sql', 'text/plain', 'application/octet-stream'],
};

// Extensões tratadas como texto puro (UTF-8).
const TEXT_EXTS = new Set(['txt', 'csv', 'json', 'js', 'ts', 'py', 'java', 'php', 'html', 'css', 'sql']);

export interface UploadedFileRecord {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  status: 'ready' | 'extract_failed';
  textPreview: string;
}

export class FileValidationError extends Error {
  status = 400;
}

// ── Magic bytes: assinatura inicial dos formatos binários ─────
function checkMagicBytes(ext: string, buf: Buffer): boolean {
  if (ext === 'pdf') {
    // %PDF
    return buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
  }
  if (ext === 'docx') {
    // DOCX é um ZIP: assinatura PK (0x50 0x4B)
    return buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b;
  }
  // Arquivos de texto: rejeita se contiver byte nulo (indício de binário disfarçado)
  if (TEXT_EXTS.has(ext)) {
    const sample = buf.subarray(0, 8000);
    return !sample.includes(0x00);
  }
  return false;
}

function getExt(filename: string): string {
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

// Sanitiza nome de arquivo — remove path traversal e caracteres perigosos.
function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 200);
}

// ── Validação completa ────────────────────────────────────────
export function validateFile(originalname: string, mimetype: string, buf: Buffer): string {
  const ext = getExt(originalname);

  if (!ext || !(ext in ALLOWED)) {
    throw new FileValidationError(`Tipo de arquivo não suportado: .${ext || 'desconhecido'}`);
  }
  if (buf.length === 0) {
    throw new FileValidationError('Arquivo vazio.');
  }
  if (buf.length > MAX_FILE_SIZE) {
    throw new FileValidationError('Arquivo excede o limite de 20 MB.');
  }
  // MIME declarado precisa bater com algum esperado (octet-stream é aceito como genérico)
  if (!ALLOWED[ext].includes(mimetype)) {
    throw new FileValidationError(`MIME type incompatível com .${ext}: ${mimetype}`);
  }
  // Magic bytes — bloqueia binário/executável disfarçado de extensão permitida
  if (!checkMagicBytes(ext, buf)) {
    throw new FileValidationError(`Conteúdo do arquivo não corresponde à extensão .${ext}.`);
  }
  return ext;
}

// ── Extração de texto ─────────────────────────────────────────
async function extractText(ext: string, buf: Buffer): Promise<string> {
  if (ext === 'pdf') {
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    const result = await parser.getText();
    return result.text ?? '';
  }
  if (ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer: buf });
    return result.value ?? '';
  }
  // Texto puro
  return buf.toString('utf-8');
}

// ── Upload principal ──────────────────────────────────────────
export async function processUpload(params: {
  userId: string;
  conversationId: string | null;
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}): Promise<UploadedFileRecord> {
  const { userId, conversationId, originalname, mimetype, buffer } = params;

  const ext = validateFile(originalname, mimetype, buffer);

  if (!supabase) {
    throw new FileValidationError('Armazenamento indisponível no momento.');
  }

  // Extração de texto — falha não impede o upload, marca status
  let extractedText = '';
  let status: 'ready' | 'extract_failed' = 'ready';
  try {
    extractedText = (await extractText(ext, buffer)).trim();
    if (!extractedText) status = 'extract_failed';
  } catch (err) {
    logger.error({ err, originalname }, '[Files] Falha na extração de texto');
    status = 'extract_failed';
  }

  const fileId = uuidv4();
  const safeName = sanitizeFilename(originalname);
  const storagePath = `${userId}/${conversationId ?? 'sem-conversa'}/${Date.now()}-${safeName}`;

  // Upload do arquivo original para o Storage
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: mimetype, upsert: false });

  if (uploadErr) {
    logger.error({ uploadErr, storagePath }, '[Files] Falha no upload ao Storage');
    throw new Error('Falha ao armazenar o arquivo.');
  }

  // Persiste metadados + texto (truncado para o limite de contexto)
  const truncatedText = extractedText.slice(0, MAX_EXTRACTED_CHARS);
  const { error: dbErr } = await supabase.from('files').insert({
    id: fileId,
    user_id: userId,
    conversation_id: conversationId,
    original_filename: originalname.slice(0, 255),
    storage_path: storagePath,
    mime_type: mimetype,
    size_bytes: buffer.length,
    extracted_text: truncatedText || null,
    status,
  });

  if (dbErr) {
    logger.error({ dbErr, fileId }, '[Files] Falha ao persistir metadados');
    // rollback do storage para não deixar órfão
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw new Error('Falha ao registrar o arquivo.');
  }

  logger.info({ fileId, userId, conversationId, ext, status, bytes: buffer.length }, '[Files] Arquivo processado');

  return {
    id: fileId,
    originalFilename: originalname,
    mimeType: mimetype,
    sizeBytes: buffer.length,
    status,
    textPreview: truncatedText.slice(0, 200),
  };
}

// ── Busca os arquivos de uma conversa (para injetar no prompt) ─
export interface ConversationFile {
  id: string;
  originalFilename: string;
  extractedText: string | null;
  status: string;
  createdAt: string;
}

export async function getConversationFiles(
  userId: string,
  conversationId: string,
  limit = 5
): Promise<ConversationFile[]> {
  if (!supabase) return [];
  // status='ready' garante que só trazemos arquivos com texto extraído com sucesso —
  // evita transferir linhas inúteis (extract_failed) do banco.
  const { data, error } = await supabase
    .from('files')
    .select('id, original_filename, extracted_text, status, created_at')
    .eq('user_id', userId)
    .eq('conversation_id', conversationId)
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    if (error) logger.error({ error, conversationId }, '[Files] Falha ao buscar arquivos da conversa');
    return [];
  }

  return data.map((f) => ({
    id: f.id,
    originalFilename: f.original_filename,
    extractedText: f.extracted_text,
    status: f.status,
    createdAt: f.created_at,
  }));
}

// ── Deleta um arquivo (storage + registro) ────────────────────
export async function deleteFile(userId: string, fileId: string): Promise<boolean> {
  if (!supabase) return false;

  const { data, error } = await supabase
    .from('files')
    .select('storage_path')
    .eq('id', fileId)
    .eq('user_id', userId)
    .single();

  if (error || !data) return false;

  await supabase.storage.from(BUCKET).remove([data.storage_path]);
  const { error: delErr } = await supabase.from('files').delete().eq('id', fileId).eq('user_id', userId);

  if (delErr) {
    logger.error({ delErr, fileId }, '[Files] Falha ao deletar arquivo');
    return false;
  }
  return true;
}
