import { useState, useCallback, useRef } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  exiting?: boolean;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    // Marca como saindo para animar saída
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300);
  }, []);

  const show = useCallback((message: string, type: ToastType = 'info', duration = 3500) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts(prev => [...prev.slice(-3), { id, message, type }]); // máx 4 toasts

    const timer = setTimeout(() => dismiss(id), duration);
    timers.current.set(id, timer);
    return id;
  }, [dismiss]);

  const toast = {
    success: (msg: string, dur?: number) => show(msg, 'success', dur),
    error:   (msg: string, dur?: number) => show(msg, 'error',   dur ?? 5000),
    info:    (msg: string, dur?: number) => show(msg, 'info',    dur),
    warn:    (msg: string, dur?: number) => show(msg, 'warning', dur),
  };

  return { toasts, toast, dismiss };
}
