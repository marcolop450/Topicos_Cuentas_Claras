import { useNavigate } from 'react-router-dom';
import { ArrowRight, Shield, Users, Receipt, BarChart3, Calculator, Sun, Moon } from 'lucide-react';
import { useTheme } from './components';

export default function LandingPage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] transition-colors">

      {/* Nav */}
      <nav className="flex items-center justify-between px-6 md:px-12 py-5 border-b border-[var(--border)]">
        <div className="flex items-center gap-2.5">
          <div className="bg-indigo-500 p-1.5 rounded-lg">
            <Calculator size={20} className="text-white" />
          </div>
          <span className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">Cuentas Claras</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggleTheme} className="p-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors" title={theme === 'light' ? 'Modo oscuro' : 'Modo claro'}>
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button onClick={() => navigate('/cuentas')} className="text-sm font-medium text-indigo-500 hover:text-indigo-600 transition-colors">
            Ir a mis cuentas
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div className="flex flex-col items-center text-center px-6 pt-16 md:pt-28 pb-20 animate-fade-in">
        <div className="inline-flex items-center gap-2 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-full px-4 py-1.5 text-sm text-indigo-600 dark:text-indigo-400 font-medium mb-6">
          <Shield size={14} />
          <span>Calculos exactos sin errores de redondeo</span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold leading-tight max-w-3xl mb-5 text-[var(--text-primary)]">
          Divide gastos,{' '}
          <span className="text-indigo-500">queda a mano</span>
        </h1>

        <p className="text-base md:text-lg text-[var(--text-secondary)] max-w-xl mb-8 leading-relaxed">
          Registra gastos compartidos entre amigos, familia o colegas.
          La app calcula quien debe cuanto y genera las transferencias minimas para saldar deudas.
        </p>

        <button
          onClick={() => navigate('/cuentas')}
          className="bg-indigo-500 hover:bg-indigo-600 text-white font-medium text-base px-6 py-3 rounded-lg transition-colors flex items-center gap-2"
        >
          Comenzar
          <ArrowRight size={18} />
        </button>
      </div>

      {/* Features */}
      <div className="max-w-4xl mx-auto px-6 pb-20">
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { icon: <Users size={22} className="text-indigo-500" />, title: 'Participantes', desc: 'Agrega personas y decide quien participa en cada gasto.' },
            { icon: <Receipt size={22} className="text-emerald-500" />, title: 'Gastos', desc: 'Registra, edita y elimina gastos con total control.' },
            { icon: <BarChart3 size={22} className="text-amber-500" />, title: 'Liquidacion', desc: 'Calculo automatico de transferencias minimas.' },
          ].map((f, i) => (
            <div key={i} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5 transition-colors">
              <div className="mb-3">{f.icon}</div>
              <h3 className="font-semibold text-[var(--text-primary)] mb-1">{f.title}</h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-[var(--border)] py-5 text-center text-xs text-[var(--text-muted)]">
        Cuentas Claras — Distribuye gastos de manera justa
      </div>
    </div>
  );
}
