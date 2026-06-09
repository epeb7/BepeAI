import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import type { Toast } from '../../hooks/useToast';

const CONFIG = {
  success: {
    icon: CheckCircle,
    bg: 'hsl(150 40% 12%)', border: 'hsl(150 40% 22%)', text: 'hsl(150 55% 60%)',
    iconColor: 'hsl(150 55% 52%)',
  },
  error: {
    icon: XCircle,
    bg: 'hsl(0 40% 14%)', border: 'hsl(0 40% 26%)', text: 'hsl(0 68% 72%)',
    iconColor: 'hsl(0 68% 58%)',
  },
  info: {
    icon: Info,
    bg: 'hsl(220 16% 14%)', border: 'hsl(220 14% 24%)', text: 'hsl(215 12% 68%)',
    iconColor: 'hsl(250 60% 68%)',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'hsl(40 40% 12%)', border: 'hsl(40 40% 24%)', text: 'hsl(40 88% 68%)',
    iconColor: 'hsl(40 88% 54%)',
  },
};

interface Props {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', bottom: '80px', right: '20px', zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: '8px',
      pointerEvents: 'none',
    }}>
      {toasts.map(toast => {
        const cfg = CONFIG[toast.type];
        const Icon = cfg.icon;
        return (
          <div
            key={toast.id}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: '10px',
              padding: '10px 14px', borderRadius: '12px', minWidth: '260px', maxWidth: '340px',
              background: cfg.bg, border: `1px solid ${cfg.border}`,
              boxShadow: '0 8px 24px hsl(0 0% 0% / 0.3)',
              animation: toast.exiting
                ? 'toastOut 0.25s ease forwards'
                : 'toastIn 0.22s cubic-bezier(0.22,1,0.36,1) both',
              pointerEvents: 'all',
            }}
          >
            <Icon size={15} style={{ color: cfg.iconColor, flexShrink: 0, marginTop: '1px' }} />
            <span style={{ flex: 1, fontSize: '12.5px', lineHeight: 1.5, color: cfg.text }}>
              {toast.message}
            </span>
            <button
              onClick={() => onDismiss(toast.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: cfg.text, opacity: 0.5, padding: '0', flexShrink: 0,
                display: 'flex', alignItems: 'center',
              }}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
