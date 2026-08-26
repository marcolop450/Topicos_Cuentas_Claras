import { Calculator, AlertCircle, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';

interface NavbarProps {
  backLabel?: string;
  backTo?: string;
}

export function Navbar({ backLabel, backTo }: NavbarProps) {
  const navigate = useNavigate();

  return (
    <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 px-4 md:px-8 py-5 rounded-b-2xl mb-6">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="bg-blue-500 p-2 rounded-xl group-hover:bg-blue-400 transition-colors">
            <Calculator size={22} className="text-white" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">Cuentas Claras</span>
        </Link>
        {backLabel && backTo && (
          <button
            onClick={() => navigate(backTo)}
            className="flex items-center gap-1 text-blue-300 hover:text-white transition-colors text-sm"
          >
            {backLabel}
          </button>
        )}
      </div>
    </div>
  );
}

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ isOpen, title, message, onConfirm, onCancel }: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-scale-in">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-xl font-bold text-gray-800">{title}</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={24} />
          </button>
        </div>
        <p className="text-gray-600 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 text-gray-600 hover:bg-gray-100 font-medium rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

interface FormErrorProps {
  message: string | null;
}

export function FormError({ message }: FormErrorProps) {
  if (!message) return null;

  return (
    <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm flex gap-2 items-start border border-red-200 animate-fade-in-up">
      <AlertCircle size={16} className="shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

export function useConfirmModal() {
  const [modal, setModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  function showConfirm(title: string, message: string, onConfirm: () => void) {
    setModal({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setModal(prev => ({ ...prev, isOpen: false }));
      },
    });
  }

  function closeConfirm() {
    setModal(prev => ({ ...prev, isOpen: false }));
  }

  return { modal, showConfirm, closeConfirm };
}
