import { useState, useEffect, memo } from 'react';
import { FileText, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import type { Message } from '../../hooks/useChat';
import { useTypewriter } from '../../hooks/useChat';

interface ChatMessageProps {
  message: Message;
  onDownloadPDF?: (data: Record<string, string>, tipo: string) => Promise<void>;
}

// ── Inline markdown ──────────────────────────────────────────
type Seg = { bold: boolean; text: string };
function parseInline(text: string): Seg[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map(p =>
    p.startsWith('**') && p.endsWith('**')
      ? { bold: true,  text: p.slice(2, -2) }
      : { bold: false, text: p }
  ).filter(s => s.text);
}
function RenderText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i, arr) => (
        <span key={i}>
          {parseInline(line).map((s, j) =>
            s.bold
              ? <strong key={j} style={{ color: 'hsl(215 18% 92%)', fontWeight: 600 }}>{s.text}</strong>
              : <span key={j}>{s.text}</span>
          )}
          {i < arr.length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

// ── Example block ─────────────────────────────────────────────
function ExampleBlock({ example }: { example: string }) {
  const lines = example.split('\n');
  const data  = /^Exemplo:/i.test(lines[0].trim()) ? lines.slice(1) : lines;
  return (
    <div style={{
      marginTop: '12px', borderRadius: '12px', overflow: 'hidden',
      border: '1px solid hsl(250 30% 28%)',
    }}>
      {/* header */}
      <div style={{
        padding: '7px 14px', display: 'flex', alignItems: 'center', gap: '6px',
        background: 'hsl(250 40% 18% / 0.6)',
        borderBottom: '1px solid hsl(250 30% 24%)',
      }}>
        <span style={{
          width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
          background: 'hsl(250 85% 68%)',
          boxShadow: '0 0 6px hsl(250 85% 60% / 0.6)',
        }} />
        <span style={{
          fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.12em', color: 'hsl(250 60% 72%)',
        }}>
          Responda neste formato
        </span>
      </div>
      {/* body */}
      <div style={{
        padding: '12px 14px', background: 'hsl(218 20% 9%)',
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
        fontSize: '12px', lineHeight: 1.7,
      }}>
        {data.map((line, i) => {
          const ci = line.indexOf(':');
          return ci > 0
            ? (
              <div key={i}>
                <span style={{ color: 'hsl(250 60% 70%)' }}>{line.slice(0, ci)}</span>
                <span style={{ color: 'hsl(215 10% 40%)' }}>:</span>
                <span style={{ color: 'hsl(215 10% 56%)' }}>{line.slice(ci + 1)}</span>
              </div>
            )
            : <div key={i} style={{ color: 'hsl(215 8% 42%)' }}>{line}</div>;
        })}
      </div>
    </div>
  );
}

// ── AI avatar ────────────────────────────────────────────────
function AiAvatar() {
  return (
    <div style={{ flexShrink: 0, marginRight: '14px', marginTop: '1px' }}>
      <div style={{
        width: '30px', height: '30px', borderRadius: '50%',
        background: 'linear-gradient(135deg, hsl(250 85% 50%), hsl(215 85% 54%))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 8px hsl(250 85% 50% / 0.3)',
        flexShrink: 0,
      }}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="2.5" fill="white" opacity="0.95" />
          <circle cx="8" cy="8" r="5.5" stroke="white" strokeWidth="1" opacity="0.4" />
          <circle cx="8" cy="8" r="7.2" stroke="white" strokeWidth="0.6" opacity="0.18" />
        </svg>
      </div>
    </div>
  );
}

// ── Timestamp relativo ────────────────────────────────────────
function relativeTime(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 10)  return 'agora';
  if (diff < 60)  return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Main ─────────────────────────────────────────────────────
function ChatMessageInner({ message, onDownloadPDF }: ChatMessageProps) {
  const isUser = message.sender === 'user';
  const [generating, setGenerating] = useState(false);
  const [pdfError,   setPdfError]   = useState(false);

  // Rastreia se o typewriter terminou neste componente
  // Começa true se a mensagem não está digitando (histórico, reload)
  const [typingDone, setTypingDone] = useState(!message.typing);

  useEffect(() => {
    // Se a mensagem mudou para typing=false externamente (histórico), sincroniza
    if (!message.typing) setTypingDone(true);
  }, [message.typing]);

  // Typewriter — o onDone marca a animação como concluída e libera o botão PDF
  const displayed = useTypewriter(message, () => setTypingDone(true));
  const textToShow = isUser ? message.text : displayed;

  const canPDF =
    !isUser &&
    typingDone &&                               // botão só aparece após typewriter terminar
    !!message.dadosExtraidos &&
    Object.keys(message.dadosExtraidos).length > 0 &&
    (message.dadosFaltantes?.length === 0 || message.readyToDownload) &&
    !!message.tipoDocumento && !!onDownloadPDF;

  const handlePDF = async () => {
    if (!canPDF || !onDownloadPDF) return;
    setGenerating(true); setPdfError(false);
    try { await onDownloadPDF(message.dadosExtraidos!, message.tipoDocumento!); }
    catch { setPdfError(true); }
    finally { setGenerating(false); }
  };

  const time = relativeTime(message.timestamp);

  // ── User bubble ──────────────────────────────────────────
  if (isUser) {
    return (
      <div className="animate-slide-up" style={{
        display: 'flex', justifyContent: 'flex-end',
        marginBottom: '20px', paddingLeft: '20%',
      }}>
        <div>
          <div style={{
            padding: '11px 16px', borderRadius: '18px',
            borderBottomRightRadius: '5px',
            background: 'hsl(250 60% 28%)',
            border: '1px solid hsl(250 50% 38% / 0.5)',
            color: 'hsl(215 20% 94%)', fontSize: '14px', lineHeight: 1.65,
            wordBreak: 'break-word',
          }}>
            <RenderText text={textToShow} />
          </div>
          <div style={{
            textAlign: 'right', marginTop: '5px', fontSize: '10px',
            color: 'hsl(215 8% 30%)', paddingRight: '4px',
          }}>
            {time}
          </div>
        </div>
      </div>
    );
  }

  // ── AI message (Claude-style: open, no bubble box) ───────
  return (
    <div className="animate-slide-up" style={{
      display: 'flex', justifyContent: 'flex-start',
      marginBottom: '24px',
    }}>
      <AiAvatar />
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Text — no bubble, just styled text directly */}
        <div style={{
          color: 'hsl(215 14% 76%)', fontSize: '14px', lineHeight: 1.75,
          wordBreak: 'break-word',
        }}>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
            <RenderText text={textToShow} />
            {!typingDone && textToShow.length > 0 && (
              <span style={{
                display: 'inline-block', width: '2px', height: '14px',
                background: 'hsl(250 60% 68%)', marginLeft: '2px',
                verticalAlign: 'middle', borderRadius: '1px',
                animation: 'blink 0.8s step-end infinite',
              }} />
            )}
          </p>

          {message.exampleBlock && <ExampleBlock example={message.exampleBlock} />}
        </div>

        {canPDF && (
          <div style={{ marginTop: '16px' }}>
            <button
              onClick={handlePDF}
              disabled={generating}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '7px',
                padding: '9px 16px', borderRadius: '10px', cursor: generating ? 'not-allowed' : 'pointer',
                background: pdfError ? 'hsl(0 40% 14%)' : 'hsl(250 40% 18%)',
                border: `1px solid ${pdfError ? 'hsl(0 50% 28%)' : 'hsl(250 40% 30%)'}`,
                color: pdfError ? 'hsl(0 68% 66%)' : 'hsl(250 60% 78%)',
                fontSize: '12.5px', fontWeight: 500, opacity: generating ? 0.7 : 1,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => !generating && !pdfError && (
                (e.currentTarget.style.background = 'hsl(250 40% 24%)')
              )}
              onMouseLeave={e => !pdfError && (
                (e.currentTarget.style.background = 'hsl(250 40% 18%)')
              )}
            >
              {generating
                ? <><Loader2 size={13} style={{ animation: 'spin 0.7s linear infinite' }} /> Gerando PDF...</>
                : pdfError
                  ? <><AlertCircle size={13} /> Erro — Tentar novamente <RotateCcw size={11} /></>
                  : <><FileText size={13} /> Gerar PDF</>
              }
            </button>
          </div>
        )}

        <div style={{ marginTop: '8px', fontSize: '10px', color: 'hsl(215 8% 28%)' }}>
          BepeAI · {time}
        </div>
      </div>
    </div>
  );
}

// memo: numa conversa longa, digitar/animar a última mensagem não re-renderiza
// todas as anteriores. Só re-renderiza quando a própria message muda de referência.
export const ChatMessage = memo(ChatMessageInner);
