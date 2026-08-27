import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { Calculator, Sun, Moon, Eye, EyeOff } from 'lucide-react';
import { useTheme } from './components';

export default function AuthPage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (tab === 'register') {
        if (!name.trim()) { setError('El nombre es obligatorio.'); setLoading(false); return; }
        if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); setLoading(false); return; }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name: name.trim() } },
        });

        if (error) throw error;
        
        if (data.session) {
          navigate('/cuentas');
        } else {
          setSuccess('Cuenta creada exitosamente. Ya puedes iniciar sesion.');
          setTab('login');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate('/cuentas');
      }
    } catch (err: any) {
      const msg = err.message || 'Error desconocido';
      if (msg.includes('Invalid login credentials')) setError('Email o contraseña incorrectos.');
      else if (msg.includes('Email not confirmed')) setError('Confirma tu correo antes de ingresar.');
      else if (msg.includes('already registered')) setError('Este correo ya esta registrado. Inicia sesion.');
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex flex-col transition-colors">
      {/* Top bar */}
      <div className="flex justify-between items-center px-6 py-4 border-b border-[var(--border)] bg-[var(--bg-card)]">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-500 p-1.5 rounded-lg">
            <Calculator size={18} className="text-white" />
          </div>
          <span className="font-semibold text-[var(--text-primary)]">Cuentas Claras</span>
        </div>
        <button onClick={toggleTheme} className="p-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors">
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
      </div>

      {/* Card */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-[var(--border)]">
            {(['login', 'register'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(null); setSuccess(null); }}
                className={`flex-1 py-3.5 text-sm font-semibold transition-colors ${tab === t ? 'text-indigo-500 border-b-2 border-indigo-500 bg-indigo-50 dark:bg-indigo-500/5' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}`}
              >
                {t === 'login' ? 'Iniciar Sesion' : 'Registrarse'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="mb-1">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                {tab === 'login' ? 'Bienvenido de nuevo' : 'Crea tu cuenta'}
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {tab === 'login' ? 'Ingresa tus credenciales para continuar.' : 'Es gratis y solo toma un momento.'}
              </p>
            </div>

            {tab === 'register' && (
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Nombre</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Tu nombre"
                  className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Correo electrónico</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                required
                className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Contraseña</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3 py-2.5 pr-10 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-2.5 rounded-lg">
                {error}
              </div>
            )}
            {success && (
              <div className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 p-2.5 rounded-lg">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50 mt-2"
            >
              {loading ? 'Procesando...' : tab === 'login' ? 'Ingresar' : 'Crear Cuenta'}
            </button>
          </form>

          <div className="px-6 pb-5 text-center text-xs text-[var(--text-muted)]">
            {tab === 'login' ? (
              <span>¿No tienes cuenta? <button onClick={() => setTab('register')} className="text-indigo-500 hover:underline font-medium">Registrate</button></span>
            ) : (
              <span>¿Ya tienes cuenta? <button onClick={() => setTab('login')} className="text-indigo-500 hover:underline font-medium">Inicia sesion</button></span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
