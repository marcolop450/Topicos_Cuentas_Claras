import { Calculator, AlertCircle, X, Sun, Moon, LogOut, UserCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, createContext, useContext } from 'react';

/* ===== THEME CONTEXT ===== */
type Theme = 'light' | 'dark';

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void }>({ theme: 'light', toggleTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('cc-theme') === 'dark' ? 'dark' : 'light'));

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('cc-theme', theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme: () => setTheme(p => p === 'light' ? 'dark' : 'light') }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() { return useContext(ThemeContext); }

/* ===== NAVBAR ===== */
interface NavbarProps {
  backLabel?: string;
  backTo?: string;
  userName?: string;
  onSignOut?: () => void;
}

export function Navbar({ backLabel, backTo, userName, onSignOut }: NavbarProps) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-[var(--bg-card)]/90 border-b border-[var(--border)] px-4 md:px-8 py-3 mb-6 transition-colors shadow-xs">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2.5 group shrink-0">
          <div className="bg-gradient-to-tr from-indigo-600 to-indigo-500 p-2 rounded-xl shadow-xs group-hover:scale-105 transition-transform">
            <Calculator size={18} className="text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm sm:text-base font-bold text-[var(--text-primary)] tracking-tight">Cuentas Claras</span>
            <span className="text-[10px] text-[var(--text-muted)] font-medium -mt-1 hidden sm:block">Finanzas entre amigos</span>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          {backLabel && backTo && (
            <button
              onClick={() => navigate(backTo)}
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] px-3 py-1.5 rounded-lg transition-colors text-xs sm:text-sm font-medium border border-transparent hover:border-[var(--border)]"
            >
              {backLabel}
            </button>
          )}

          {userName && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)] px-3 py-1.5 rounded-full border border-[var(--border)] font-medium">
              <UserCircle size={15} className="text-indigo-500" />
              <span className="max-w-[130px] truncate">{userName}</span>
            </div>
          )}

          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] border border-transparent hover:border-[var(--border)] transition-all"
            title={theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
            aria-label="Cambiar tema"
          >
            {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
          </button>

          {onSignOut && (
            <button
              onClick={onSignOut}
              className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 border border-transparent hover:border-red-200 dark:hover:border-red-500/20 transition-all"
              title="Cerrar sesion"
              aria-label="Cerrar sesión"
            >
              <LogOut size={17} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

/* ===== CONFIRM MODAL ===== */
interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ isOpen, title, message, confirmLabel = 'Eliminar', onConfirm, onCancel }: ConfirmModalProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
      <div className="bg-[var(--bg-card)] rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-[var(--border)] animate-in zoom-in-95 duration-150">
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
          <button onClick={onCancel} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-lg transition-colors"><X size={18} /></button>
        </div>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-5">{message}</p>
        <div className="flex justify-end gap-2.5">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] font-medium rounded-xl border border-[var(--border)] transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white font-medium rounded-xl transition-colors shadow-xs"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===== JOIN ROOM MODAL ===== */
interface JoinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoin: (code: string) => Promise<void>;
}

export function JoinModal({ isOpen, onClose, onJoin }: JoinModalProps) {
  const [code, setCode] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() { setCode(''); setAgreed(false); setError(null); setLoading(false); }

  async function handleJoin() {
    if (!code.trim() || code.length !== 6) { setError('Ingresa un codigo de 6 caracteres.'); return; }
    if (!agreed) { setError('Debes aceptar el acuerdo para unirte.'); return; }
    setLoading(true);
    setError(null);
    try {
      await onJoin(code.trim().toUpperCase());
      reset();
      onClose();
    } catch (err: any) {
      setError(err.message || 'No se pudo unir a la sala.');
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl max-w-sm w-full p-6 border border-[var(--border)]">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Unirse a una Sala</h3>
          <button onClick={() => { reset(); onClose(); }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"><X size={20} /></button>
        </div>

        <p className="text-xs text-[var(--text-secondary)] mb-4">Ingresa el codigo de 6 caracteres que te compartio el organizador de la sala.</p>

        <input
          type="text"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase().slice(0, 6))}
          placeholder="Ej. A4X9KL"
          className="w-full px-3 py-2.5 text-center text-xl font-bold tracking-[0.5em] border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors placeholder:tracking-normal placeholder:text-base placeholder:font-normal placeholder:text-[var(--text-muted)] mb-4"
        />

        <label className="flex items-start gap-2.5 cursor-pointer mb-4">
          <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 w-4 h-4 rounded text-indigo-500 focus:ring-indigo-500 shrink-0" />
          <span className="text-xs text-[var(--text-secondary)] leading-relaxed">
            Confirmo que acepto unirme a esta sala y participar en la division de gastos. Entiendo que los balances seran calculados automaticamente.
          </span>
        </label>

        {error && (
          <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-2.5 rounded-lg mb-3 flex gap-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={() => { reset(); onClose(); }} className="flex-1 py-2.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] font-medium rounded-lg transition-colors border border-[var(--border)]">
            Cancelar
          </button>
          <button onClick={handleJoin} disabled={loading} className="flex-1 py-2.5 text-sm bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50">
            {loading ? 'Buscando...' : 'Unirse'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===== FORM ERROR ===== */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm flex gap-2 items-start border border-red-200 dark:border-red-500/20 mt-2 animate-fade-in">
      <AlertCircle size={16} className="shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

/* ===== CONFIRM MODAL HOOK ===== */
export function useConfirmModal() {
  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  function showConfirm(title: string, message: string, onConfirm: () => void) {
    setModal({ isOpen: true, title, message, onConfirm: () => { onConfirm(); setModal(prev => ({ ...prev, isOpen: false })); } });
  }

  function closeConfirm() { setModal(prev => ({ ...prev, isOpen: false })); }

  return { modal, showConfirm, closeConfirm };
}
