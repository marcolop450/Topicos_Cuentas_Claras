import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { calculateBalances, calculateSettlement, Participant, Expense, ExpenseSplit, Balance, Transfer } from './utils';
import { Trash2, Edit2, Plus, Users, Receipt, Calculator, AlertCircle } from 'lucide-react';

function App() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [splits, setSplits] = useState<ExpenseSplit[]>([]);
  
  const [newParticipantName, setNewParticipantName] = useState('');
  
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [payerId, setPayerId] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'participants' | 'expenses' | 'balances'>('expenses');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      // Check if supabase config is missing
      if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
         setError('Faltan variables de entorno de Supabase. Configura .env.local');
         setLoading(false);
         return;
      }

      const { data: pData, error: pError } = await supabase.from('participants').select('*').order('created_at', { ascending: true });
      const { data: eData, error: eError } = await supabase.from('expenses').select('*').order('created_at', { ascending: false });
      const { data: sData, error: sError } = await supabase.from('expense_splits').select('*');

      if (pError) throw pError;
      if (eError) throw eError;
      if (sError) throw sError;

      setParticipants(pData || []);
      setExpenses(eData || []);
      setSplits(sData || []);
    } catch (err: any) {
      console.error(err);
      setError('Error al cargar datos. Verifica la conexión a Supabase y que las tablas existan.');
    } finally {
      setLoading(false);
    }
  }

  async function addParticipant(e: React.FormEvent) {
    e.preventDefault();
    if (!newParticipantName.trim()) return;

    try {
      const { data, error } = await supabase
        .from('participants')
        .insert([{ name: newParticipantName.trim() }])
        .select();

      if (error) throw error;
      
      setParticipants([...participants, data[0]]);
      setNewParticipantName('');
    } catch (err: any) {
      alert('Error agregando participante');
    }
  }

  async function saveExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!description || !amount || !payerId || selectedParticipants.length === 0) {
      alert('Completa todos los campos y selecciona al menos un participante para dividir.');
      return;
    }

    try {
      if (editingExpenseId) {
        // Edit mode
        const { error: expError } = await supabase
          .from('expenses')
          .update({ 
            description, 
            amount: parseFloat(amount), 
            payer_id: payerId 
          })
          .eq('id', editingExpenseId);
          
        if (expError) throw expError;

        // Delete old splits
        await supabase.from('expense_splits').delete().eq('expense_id', editingExpenseId);
        
        // Insert new splits
        const splitsToInsert = selectedParticipants.map(pId => ({
          expense_id: editingExpenseId,
          participant_id: pId
        }));
        
        const { data: splData, error: splError } = await supabase
          .from('expense_splits')
          .insert(splitsToInsert)
          .select();
          
        if (splError) throw splError;

        // Update local state
        setExpenses(expenses.map(exp => exp.id === editingExpenseId ? { ...exp, description, amount: parseFloat(amount), payer_id: payerId } : exp));
        setSplits([...splits.filter(s => s.expense_id !== editingExpenseId), ...(splData || [])]);
        
        setEditingExpenseId(null);
      } else {
        // Add mode
        const { data: expData, error: expError } = await supabase
          .from('expenses')
          .insert([{ 
            description, 
            amount: parseFloat(amount), 
            payer_id: payerId 
          }])
          .select();

        if (expError) throw expError;
        
        const newExpense = expData[0];

        // Insert splits
        const splitsToInsert = selectedParticipants.map(pId => ({
          expense_id: newExpense.id,
          participant_id: pId
        }));

        const { data: splData, error: splError } = await supabase
          .from('expense_splits')
          .insert(splitsToInsert)
          .select();

        if (splError) throw splError;

        setExpenses([newExpense, ...expenses]);
        setSplits([...splits, ...(splData || [])]);
      }
      
      // Reset form
      setDescription('');
      setAmount('');
      // Keep payer and selected participants for convenience
    } catch (err: any) {
      alert('Error guardando gasto');
    }
  }

  function startEditExpense(exp: Expense) {
    setEditingExpenseId(exp.id);
    setDescription(exp.description);
    setAmount(exp.amount.toString());
    setPayerId(exp.payer_id);
    
    const expSplits = splits.filter(s => s.expense_id === exp.id);
    setSelectedParticipants(expSplits.map(s => s.participant_id));
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingExpenseId(null);
    setDescription('');
    setAmount('');
  }

  async function deleteExpense(id: string) {
    if (!confirm('¿Eliminar gasto?')) return;
    try {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
      
      setExpenses(expenses.filter(e => e.id !== id));
      setSplits(splits.filter(s => s.expense_id !== id));
    } catch (err: any) {
      alert('Error al eliminar');
    }
  }

  // Derived state
  const balances = calculateBalances(participants, expenses, splits);
  const settlements = calculateSettlement(balances);
  
  // Checking sum of balances for debugging
  const balanceSum = balances.reduce((sum, b) => sum + b.balance, 0);
  const isBalanceZero = Math.abs(balanceSum) < 0.01;

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando...</div>;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-800 flex items-center justify-center gap-2">
          <Calculator className="text-blue-600" />
          Cuentas Claras
        </h1>
        <p className="text-gray-500 mt-2">Divide gastos de viaje con amigos fácilmente</p>
      </header>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6 flex gap-2 items-start border border-red-200">
          <AlertCircle className="shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-medium">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-6 bg-white p-1 rounded-lg shadow-sm border border-gray-100">
        <button 
          onClick={() => setActiveTab('participants')}
          className={`flex-1 flex justify-center items-center gap-2 py-2 px-4 rounded-md transition-colors ${activeTab === 'participants' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          <Users size={18} /> Participantes
        </button>
        <button 
          onClick={() => setActiveTab('expenses')}
          className={`flex-1 flex justify-center items-center gap-2 py-2 px-4 rounded-md transition-colors ${activeTab === 'expenses' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          <Receipt size={18} /> Gastos
        </button>
        <button 
          onClick={() => setActiveTab('balances')}
          className={`flex-1 flex justify-center items-center gap-2 py-2 px-4 rounded-md transition-colors ${activeTab === 'balances' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          <Calculator size={18} /> Liquidación
        </button>
      </div>

      <main>
        {/* PARTICIPANTES TAB */}
        {activeTab === 'participants' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-semibold mb-4">Agregar Participante</h2>
              <form onSubmit={addParticipant} className="flex gap-2">
                <input 
                  type="text" 
                  value={newParticipantName}
                  onChange={e => setNewParticipantName(e.target.value)}
                  placeholder="Nombre del amigo (ej. Ana)" 
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
                  <Plus size={18} /> Agregar
                </button>
              </form>
            </div>
            <div className="p-6">
              <h3 className="font-medium text-gray-700 mb-4">Lista de Participantes ({participants.length})</h3>
              {participants.length === 0 ? (
                <p className="text-gray-500 text-sm">No hay participantes aún.</p>
              ) : (
                <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {participants.map(p => (
                    <li key={p.id} className="bg-gray-50 px-4 py-3 rounded-lg border border-gray-100 text-gray-800 text-center font-medium">
                      {p.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* GASTOS TAB */}
        {activeTab === 'expenses' && (
          <div className="grid md:grid-cols-5 gap-6">
            <div className="md:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-fit">
              <h2 className="text-xl font-semibold mb-4">{editingExpenseId ? 'Editar Gasto' : 'Registrar Gasto'}</h2>
              <form onSubmit={saveExpense} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                  <input 
                    type="text" 
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Ej. Cabaña Samaipata" 
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monto (Bs.)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="800.00" 
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">¿Quién pagó?</label>
                  <select 
                    value={payerId}
                    onChange={e => setPayerId(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                  >
                    <option value="">Selecciona...</option>
                    {participants.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-gray-700">Dividir entre</label>
                    <button 
                      type="button" 
                      onClick={() => setSelectedParticipants(participants.map(p => p.id))}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Todos
                    </button>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto p-2 border border-gray-200 rounded-lg bg-gray-50">
                    {participants.length === 0 && <p className="text-xs text-gray-500 text-center py-2">Agrega participantes primero</p>}
                    {participants.map(p => (
                      <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={selectedParticipants.includes(p.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedParticipants([...selectedParticipants, p.id]);
                            } else {
                              setSelectedParticipants(selectedParticipants.filter(id => id !== p.id));
                            }
                          }}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        {p.name}
                      </label>
                    ))}
                  </div>
                </div>
                
                <div className="flex gap-2 pt-2">
                  <button 
                    type="submit" 
                    disabled={participants.length === 0}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {editingExpenseId ? 'Guardar Cambios' : 'Guardar Gasto'}
                  </button>
                  {editingExpenseId && (
                    <button 
                      type="button" 
                      onClick={cancelEdit}
                      className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium px-4 py-2 rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </div>
            
            <div className="md:col-span-3 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-xl font-semibold mb-4">Historial de Gastos</h2>
              {expenses.length === 0 ? (
                <div className="text-center py-10 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                  <Receipt className="mx-auto text-gray-400 mb-2" size={32} />
                  <p className="text-gray-500">No hay gastos registrados.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {expenses.map(exp => {
                    const payer = participants.find(p => p.id === exp.payer_id)?.name || 'Desconocido';
                    const expSplits = splits.filter(s => s.expense_id === exp.id);
                    return (
                      <div key={exp.id} className="flex justify-between items-center p-4 rounded-lg border border-gray-100 hover:border-blue-100 hover:shadow-sm transition-all group">
                        <div>
                          <p className="font-semibold text-gray-800">{exp.description}</p>
                          <p className="text-sm text-gray-500">
                            {payer} pagó <span className="font-medium text-gray-700">Bs. {exp.amount}</span>
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            Dividido entre {expSplits.length} {expSplits.length === 1 ? 'persona' : 'personas'}
                          </p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button 
                            onClick={() => startEditExpense(exp)}
                            className="text-blue-400 hover:text-blue-600 p-2 rounded-full hover:bg-blue-50"
                            title="Editar gasto"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button 
                            onClick={() => deleteExpense(exp.id)}
                            className="text-red-400 hover:text-red-600 p-2 rounded-full hover:bg-red-50"
                            title="Eliminar gasto"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* LIQUIDACION TAB */}
        {activeTab === 'balances' && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold">Balances</h2>
                {!isBalanceZero && (
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium flex items-center gap-1">
                    <AlertCircle size={12}/> Error de redondeo: {balanceSum.toFixed(2)}
                  </span>
                )}
              </div>
              
              <ul className="space-y-3">
                {balances.map(b => (
                  <li key={b.participantId} className="flex justify-between items-center p-3 rounded-lg bg-gray-50">
                    <span className="font-medium">{b.name}</span>
                    <span className={`font-bold ${b.balance > 0 ? 'text-green-600' : b.balance < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                      {b.balance > 0 ? '+' : ''}{b.balance.toFixed(2)} Bs.
                    </span>
                  </li>
                ))}
                {balances.length === 0 && <p className="text-sm text-gray-500">No hay datos</p>}
              </ul>
              
              <div className="mt-4 text-xs text-gray-500 p-3 bg-blue-50 rounded-lg">
                <strong>¿Cómo leer esto?</strong>
                <ul className="list-disc pl-4 mt-1">
                  <li><span className="text-green-600 font-medium">Verde (+)</span>: A esta persona le deben dinero (pagó de más).</li>
                  <li><span className="text-red-600 font-medium">Rojo (-)</span>: Esta persona debe dinero (le pagaron su parte).</li>
                </ul>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-xl font-semibold mb-6">Cómo quedar a mano</h2>
              
              {settlements.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 font-medium">¡Están todos a mano! 🎉</p>
                  <p className="text-sm text-gray-400 mt-1">No hay deudas pendientes.</p>
                </div>
              ) : (
                <ul className="space-y-4">
                  {settlements.map((t, i) => (
                    <li key={i} className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 bg-white shadow-sm">
                      <div className="flex-1 text-right font-medium text-red-600">{t.from}</div>
                      <div className="flex flex-col items-center justify-center px-4">
                        <span className="text-xs text-gray-500 font-semibold mb-1">paga a</span>
                        <div className="w-16 h-px bg-gray-300 relative">
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 border-t-2 border-r-2 border-gray-300 transform rotate-45 translate-x-1"></div>
                        </div>
                        <span className="font-bold text-gray-800 mt-1 text-sm bg-gray-100 px-2 py-0.5 rounded">
                          Bs. {t.amount.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex-1 text-left font-medium text-green-600">{t.to}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
