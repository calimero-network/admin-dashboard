import React from 'react';
import { useToast } from '../contexts/ToastContext';
import { Check, X, AlertTriangle, Info } from 'lucide-react';
import './ToastContainer.css';

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="toast-container">
      <div className="toast-container-inner">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast-${toast.type}`}
            role="alert"
            aria-live="polite"
          >
            <div className="toast-content">
              <div className="toast-icon">
                {toast.type === 'success' && <Check size={18} />}
                {toast.type === 'error' && <X size={18} />}
                {toast.type === 'warning' && <AlertTriangle size={18} />}
                {toast.type === 'info' && <Info size={18} />}
              </div>
              <div className="toast-message">{toast.message}</div>
            </div>
            <button
              className="toast-close"
              onClick={() => removeToast(toast.id)}
              aria-label="Close notification"
            >
              <X size={18} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
