import { useNavigate } from 'react-router-dom';
import { Users, Receipt, BarChart3, ArrowRight, Shield, Calculator } from 'lucide-react';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white overflow-hidden">

      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute top-1/2 -left-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-float delay-300"></div>
        <div className="absolute -bottom-40 right-1/3 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-float delay-600"></div>
      </div>

      {/* Header */}
      <nav className="relative z-10 flex items-center justify-between px-6 md:px-12 py-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="bg-blue-500 p-2 rounded-xl">
            <Calculator size={24} className="text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">Cuentas Claras</span>
        </div>
        <button
          onClick={() => navigate('/cuentas')}
          className="text-blue-300 hover:text-white transition-colors text-sm font-medium border border-blue-400/30 px-4 py-2 rounded-lg hover:border-blue-400/60"
        >
          Ir a mis cuentas
        </button>
      </nav>

      {/* Hero Section */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 pt-12 md:pt-24 pb-16">
        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 text-sm text-blue-200 mb-8 animate-fade-in-up">
          <Shield size={14} />
          <span>Calculos exactos, sin errores de redondeo</span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold leading-tight max-w-4xl mb-6 animate-fade-in-up delay-100">
          Divide gastos
          <span className="block bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-300 bg-clip-text text-transparent">
            sin complicaciones
          </span>
        </h1>

        <p className="text-lg md:text-xl text-slate-300 max-w-2xl mb-10 leading-relaxed animate-fade-in-up delay-200">
          Registra los gastos compartidos entre amigos, familia o compañeros de trabajo.
          La aplicacion calcula automaticamente cuanto debe cada quien y genera las
          transferencias exactas para quedar a mano.
        </p>

        <button
          onClick={() => navigate('/cuentas')}
          className="group relative bg-blue-600 hover:bg-blue-500 text-white font-semibold text-lg px-8 py-4 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/30 hover:-translate-y-0.5 flex items-center gap-3 animate-fade-in-up delay-300 animate-pulse-glow"
        >
          Comenzar ahora
          <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" />
        </button>
      </div>

      {/* Features Section */}
      <div className="relative z-10 max-w-6xl mx-auto px-6 pb-24">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">

          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all duration-300 hover:-translate-y-1 animate-fade-in-up delay-400">
            <div className="bg-blue-500/20 w-12 h-12 rounded-xl flex items-center justify-center mb-4">
              <Users size={24} className="text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Participantes flexibles</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Agrega a las personas que participan. Cada gasto puede dividirse entre todos o solo algunos del grupo.
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all duration-300 hover:-translate-y-1 animate-fade-in-up delay-500">
            <div className="bg-cyan-500/20 w-12 h-12 rounded-xl flex items-center justify-center mb-4">
              <Receipt size={24} className="text-cyan-400" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Registro de gastos</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Registra cada gasto con su descripcion, monto y quien lo pago. Edita o elimina en cualquier momento.
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all duration-300 hover:-translate-y-1 animate-fade-in-up delay-600 sm:col-span-2 lg:col-span-1">
            <div className="bg-indigo-500/20 w-12 h-12 rounded-xl flex items-center justify-center mb-4">
              <BarChart3 size={24} className="text-indigo-400" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Liquidacion inteligente</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              La app calcula los balances y genera la menor cantidad de transferencias necesarias para saldar todas las deudas.
            </p>
          </div>

        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 border-t border-white/10 py-6 text-center text-sm text-slate-500 animate-fade-in delay-700">
        Cuentas Claras — Distribuye gastos de manera justa y transparente
      </div>
    </div>
  );
}
