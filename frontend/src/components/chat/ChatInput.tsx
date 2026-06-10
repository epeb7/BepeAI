import { useState, KeyboardEvent, useRef, useEffect } from 'react';
import { ArrowUp, Paperclip, X, FileText, Loader2 } from 'lucide-react';
import { uploadFile, deleteUploadedFile, validateClientFile, ACCEPTED_EXTENSIONS, UploadedFile } from '../../services/upload.service';

// Sugestões contextuais por situação
const QUICK_WORKFLOW = ['sim', 'corrigir empresa', 'cancelar', 'ajuda'];
const QUICK_IDLE     = ['contrato', 'proposta comercial', 'relatório final', 'orçamento'];

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled: boolean;
  workflowActive?: boolean;  // true quando workflow está em andamento
  workflowComplete?: boolean; // true quando todos os dados foram coletados
  conversationId?: string | null; // conversa atual — associa o upload
  onFileUploaded?: (file: UploadedFile) => void; // notifica o pai sobre anexo
  onConversationCreated?: (id: string) => void; // backend criou conversa no upload
}

export const ChatInput = ({ onSend, disabled, workflowActive, workflowComplete, conversationId, onFileUploaded, onConversationCreated }: ChatInputProps) => {
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pode enviar se há texto OU se há um arquivo anexado (mesmo sem texto).
  const canSend = (!!input.trim() || attachments.length > 0) && !disabled;

  const handleSubmit = () => {
    if (!canSend) return;
    // Sem texto mas com anexo: instrução padrão que faz a IA reconhecer o anexo
    // e perguntar que tipo de documento criar a partir dele.
    const text = input.trim() || (attachments.length > 0
      ? 'Anexei um arquivo. Que tipo de documento posso criar a partir dele?'
      : '');
    if (!text) return;
    onSend(text);
    setInput('');
    setAttachments([]);  // anexos já estão associados à conversa no backend
    const ta = textareaRef.current;
    if (ta) { ta.style.height = 'auto'; }
    setTimeout(() => textareaRef.current?.focus(), 10);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 148) + 'px';
  };

  const quickSend = (text: string) => {
    onSend(text);
    textareaRef.current?.focus();
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0]; // Fase 1: um arquivo por vez
    setUploadError(null);

    const clientError = validateClientFile(file);
    if (clientError) { setUploadError(clientError); return; }

    setUploading(true);
    try {
      const { file: uploaded, conversationId: convId } = await uploadFile(file, conversationId ?? null);
      setAttachments(prev => [...prev, uploaded]);
      onFileUploaded?.(uploaded);
      if (convId) onConversationCreated?.(convId);
      if (uploaded.status === 'extract_failed') {
        setUploadError('Arquivo enviado, mas não consegui extrair o texto dele.');
      }
    } catch (err: any) {
      setUploadError(err?.response?.data?.error ?? 'Falha ao enviar o arquivo.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = async (fileId: string) => {
    setAttachments(prev => prev.filter(a => a.id !== fileId));
    try { await deleteUploadedFile(fileId); } catch { /* best-effort */ }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled || uploading) return;
    handleFiles(e.dataTransfer.files);
  };

  const fmtSize = (bytes: number) =>
    bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  useEffect(() => {
    if (!disabled) textareaRef.current?.focus();
  }, [disabled]);

  // Quais chips mostrar
  const chips = workflowComplete
    ? QUICK_WORKFLOW
    : workflowActive
      ? []                  // não interrompe com chips enquanto coleta dados
      : QUICK_IDLE;

  return (
    <div>
      <style>{`@keyframes bepe-spin { to { transform: rotate(360deg); } } .spin { animation: bepe-spin 0.8s linear infinite; }`}</style>
      {/* ── Chips de sugestão rápida ──────────────────────────── */}
      {chips.length > 0 && !disabled && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '6px',
          marginBottom: '8px',
        }}>
          {chips.map(chip => (
            <button
              key={chip}
              onClick={() => quickSend(chip)}
              style={{
                padding: '4px 10px', borderRadius: '20px', cursor: 'pointer',
                background: 'hsl(220 16% 14%)',
                border: '1px solid hsl(220 14% 22%)',
                color: 'hsl(215 10% 54%)',
                fontSize: '11.5px', fontWeight: 500,
                transition: 'all 0.14s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background    = 'hsl(250 30% 18%)';
                e.currentTarget.style.borderColor   = 'hsl(250 40% 32%)';
                e.currentTarget.style.color         = 'hsl(250 60% 70%)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background    = 'hsl(220 16% 14%)';
                e.currentTarget.style.borderColor   = 'hsl(220 14% 22%)';
                e.currentTarget.style.color         = 'hsl(215 10% 54%)';
              }}
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* ── Anexos enviados ───────────────────────────────────── */}
      {attachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
          {attachments.map(a => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '5px 8px 5px 10px', borderRadius: '10px',
              background: 'hsl(250 30% 16%)', border: '1px solid hsl(250 30% 26%)',
              fontSize: '11.5px', color: 'hsl(250 30% 80%)', maxWidth: '240px',
            }}>
              <FileText size={13} color="hsl(250 60% 68%)" style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.originalFilename}
              </span>
              <span style={{ color: 'hsl(250 20% 55%)', fontSize: '10px', flexShrink: 0 }}>
                {fmtSize(a.sizeBytes)}
              </span>
              <button
                onClick={() => removeAttachment(a.id)}
                title="Remover"
                style={{
                  display: 'flex', border: 'none', background: 'transparent',
                  cursor: 'pointer', padding: 0, flexShrink: 0,
                }}
              >
                <X size={13} color="hsl(250 20% 60%)" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Erro de upload ────────────────────────────────────── */}
      {uploadError && (
        <div style={{
          marginBottom: '8px', padding: '6px 10px', borderRadius: '8px',
          background: 'hsl(0 50% 16%)', border: '1px solid hsl(0 50% 30%)',
          fontSize: '11.5px', color: 'hsl(0 70% 78%)',
        }}>
          {uploadError}
        </div>
      )}

      {/* input de arquivo oculto */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(',')}
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* ── Campo de texto ────────────────────────────────────── */}
      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled && !uploading) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
        display: 'flex', alignItems: 'flex-end', gap: '8px',
        padding: '10px 12px 10px 12px', borderRadius: '16px',
        background: dragOver ? 'hsl(250 30% 15%)' : 'hsl(220 16% 13%)',
        border: `1px solid ${dragOver ? 'hsl(250 60% 50%)' : focused ? 'hsl(250 60% 44%)' : 'hsl(220 14% 20%)'}`,
        boxShadow: focused ? '0 0 0 3px hsl(250 85% 60% / 0.10)' : 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
      }}>
        {/* botão de anexar */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          title="Anexar arquivo (PDF, DOCX, TXT, CSV, código)"
          style={{
            width: '32px', height: '32px', borderRadius: '10px', flexShrink: 0,
            border: 'none', background: 'transparent',
            cursor: (disabled || uploading) ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: (disabled || uploading) ? 0.4 : 1, transition: 'all 0.15s',
          }}
        >
          {uploading
            ? <Loader2 size={16} color="hsl(250 60% 68%)" className="spin" />
            : <Paperclip size={16} color="hsl(215 10% 54%)" />}
        </button>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={workflowActive ? 'Responda aqui… (Enter para enviar)' : 'Escreva uma mensagem…'}
          disabled={disabled}
          rows={1}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            resize: 'none', fontFamily: 'inherit', fontSize: '13.5px', lineHeight: 1.6,
            color: 'hsl(215 16% 82%)', minHeight: '22px', maxHeight: '148px',
            opacity: disabled ? 0.5 : 1,
          }}
        />

        <button
          onClick={handleSubmit}
          disabled={!canSend}
          title={canSend ? 'Enviar (Enter)' : ''}
          style={{
            width: '32px', height: '32px', borderRadius: '10px', flexShrink: 0,
            border: 'none', cursor: canSend ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: canSend
              ? 'linear-gradient(135deg, hsl(250 85% 55%), hsl(215 85% 52%))'
              : 'hsl(220 14% 20%)',
            boxShadow: canSend ? '0 2px 10px hsl(250 85% 50% / 0.30)' : 'none',
            transition: 'all 0.15s',
            transform: canSend ? 'scale(1)' : 'scale(0.92)',
            opacity: canSend ? 1 : 0.4,
          }}
        >
          <ArrowUp size={14} color="white" />
        </button>
      </div>
    </div>
  );
};
