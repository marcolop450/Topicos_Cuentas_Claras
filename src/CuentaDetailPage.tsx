import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { calculateBalances, calculateSettlement } from './utils';
import type { Group, Participant, Expense, ExpenseSplit } from './utils';
import { Trash2, Edit2, Plus, Users, Receipt, Calculator, AlertCircle, FolderOpen, ArrowLeft } from 'lucide-react';
import { Navbar, ConfirmModal, FormError, useConfirmModal } from './components';

export default function CuentaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [group, setGroup] = useState<Group | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [splits, setSplits] = useState<ExpenseSplit[]>([]);

  // Forms
  const [newParticipantName, setNewParticipantName] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [payerId, setPayerId] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  // UI
  const [loading, setLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'participants' | 'expenses' | 'balances'>('participants');
  const { modal, showConfirm, closeConfirm } = useConfirmModal();

  useEffect(() => {
    if (id) fetchAll(id);
  }, [id]);

  useEffect(() => {
    setFormError(null);
  }, [activeTab]);

  async function fetchAll(groupId: string) {
    setLoading(true);
    try {
      const { data: gData } = await supabase.from('groups').select('*').eq('id', groupId).single();
      const { data: pData } = await supabase.from('participants').select('*').eq('group_id', groupId).order('created_at', { ascending: true });
      const { data: eData } = await supabase.from('expenses').select('*').eq('group_id', groupId).order('created_at', { ascending: false });
      const { data: sData } = await supabase.from('expense_splits').select('*');

      if (!gData) {
        navigate('/cuentas');
        return;
      }

      setGroup(gData);
      setParticipants(pData || []);
      setExpenses(eData || []);
      setSplits(sData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function addParticipant(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!newParticipantName.trim()) {
      setFormError('Por favor, ingresa el nombre del participante.');
      return;
    }
    try {
      const { data, error } = await supabase
        .from('participants')
        .insert([{ name: newParticipantName.trim(), group_id: id }])
        .select();
      if (error) throw error;
      setParticipants([...participants, data[0]]);
      setNewParticipantName('');
    } catch (err: any) {
      setFormError('Hubo un error al agregar el participante.');
    }
  }

  async function saveExpense(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!description.trim()) { setFormError('La descripcion del gasto es obligatoria.'); return; }
    if (!amount || parseFloat(amount) <= 0) { setFormError('Ingresa un monto valido mayor a 0.'); return; }
    if (!payerId) { setFormError('Selecciona la persona que pago el gasto.'); return; }
    if (selectedParticipants.length === 0) { setFormError('Debes seleccionar al menos un participante.'); return; }

    try {
      if (editingExpenseId) {
        const { error: expError } = await supabase
          .from('expenses')
          .update({ description: description.trim(), amount: parseFloat(amount), payer_id: payerId })
          .eq('id', editingExpenseId);
        if (expError) throw expError;
        await supabase.from('expense_splits').delete().eq('expense_id', editingExpenseId);
        const splitsToInsert = selectedParticipants.map(pId => ({ expense_id: editingExpenseId, participant_id: pId }));
        const { data: splData, error: splError } = await supabase.from('expense_splits').insert(splitsToInsert).select();
        if (splError) throw splError;
        setExpenses(expenses.map(exp => exp.id === editingExpenseId ? { ...exp, description: description.trim(), amount: parseFloat(amount), payer_id: payerId } : exp));
        setSplits([...splits.filter(s => s.expense_id !== editingExpenseId), ...(splData || [])]);
        setEditingExpenseId(null);
      } else {
        const { data: expData, error: expError } = await supabase
          .from('expenses')
          .insert([{ group_id: id, description: description.trim(), amount: parseFloat(amount), payer_id: payerId }])
          .select();
        if (expError) throw expError;
        const newExpense = expData[0];
        const splitsToInsert = selectedParticipants.map(pId => ({ expense_id: newExpense.id, participant_id: pId }));
        const { data: splData, error: splError } = await supabase.from('expense_splits').insert(splitsToInsert).select();
        if (splError) throw splError;
        setExpenses([newExpense, ...expenses]);
        setSplits([...splits, ...(splData || [])]);
      }
      setDescription('');
      setAmount('');
    } catch (err: any) {
      setFormError('Error guardando el gasto. Intenta nuevamente.');
    }
  }

  function startEditExpense(exp: Expense) {
    setFormError(null);
    setEditingExpenseId(exp.id);
    setDescription(exp.description);
    setAmount(exp.amount.toString());
    setPayerId(exp.payer_id);
    const expSplits = splits.filter(s => s.expense_id === exp.id);
    setSelectedParticipants(expSplits.map(s => s.participant_id));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setFormError(null);
    setEditingExpenseId(null);
    setDescription('');
    setAmount('');
  }

  function handleDeleteExpense(expenseId: string) {
    showConfirm(
      'Eliminar Gasto',
      'Esto afectara los balances de todos los participantes.',
      async () => {
        try {
          const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
          if (error) throw error;
          setExpenses(expenses.filter(e => e.id !== expenseId));
          setSplits(splits.filter(s => s.expense_id !== expenseId));
        } catch (err: any) { /* silently handle */ }
      }
    );
  }

  const balances = calculateBalances(participants, expenses, splits);
  const settlements = calculateSettlement(balances);
  const balanceSum = balances.reduce((sum, b) => sum + b.balance, 0);
  const isBalanceZero = Math.abs(balanceSum) < 0.01;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar backLabel="Volver a cuentas" backTo="/cuentas" />
        <div className="p-8 text-center text-gray-500">Cargando...</div>
      </div>
    );
  }

  const tabs = [
    { key: 'participants' as const, label: 'Participantes', icon: <Users size={18} /> },
    { key: 'expenses' as const, label: 'Gastos', icon: <Receipt size={18} /> },
    { key: 'balances' as const, label: 'Liquidacion', icon: <Calculator size={18} /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar backLabel="Volver a cuentas" backTo="/cuentas" />
      <ConfirmModal isOpen={modal.isOpen} title={modal.title} message={modal.message} onConfirm={modal.onConfirm} onCancel={closeConfirm} />

      <div className="max-w-5xl mx-auto px-4 md:px-8 pb-12">
        <div className="page-enter">

          {/* Group header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-5 md:p-6 mb-6 flex items-center gap-4 shadow-lg shadow-blue-500/15 animate-fade-in-up">
            <div className="bg-white/20 p-3 rounded-xl">
              <FolderOpen size={28} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{group?.name}</h1>
              <p className="text-blue-200 text-sm mt-0.5">{participants.length} participantes -- {expenses.length} gastos registrados</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100 overflow-x-auto animate-fade-in-up delay-100">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex justify-center items-center gap-2 py-3 px-4 rounded-xl transition-all duration-200 whitespace-nowrap font-medium text-sm ${
                  activeTab === tab.key
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* PARTICIPANTES TAB */}
          {activeTab === 'participants' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in-up delay-200">
              <div className="p-5 md:p-6 border-b border-gray-100">
                <h2 className="text-xl font-semibold mb-4">Agregar Participante</h2>
                <form onSubmit={addParticipant}>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={newParticipantName}
                      onChange={e => setNewParticipantName(e.target.value)}
                      placeholder="Nombre de la persona (ej. Ana)"
                      className={`flex-1 px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors ${formError ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}
                    />
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl flex items-center justify-center gap-2 transition-all duration-200 font-medium hover:shadow-lg hover:shadow-blue-500/20">
                      <Plus size={18} /> Agregar
                    </button>
                  </div>
                  <div className="mt-2"><FormError message={formError} /></div>
                </form>
              </div>
              <div className="p-5 md:p-6">
                <h3 className="font-medium text-gray-500 text-sm uppercase tracking-wider mb-4">Lista de Participantes ({participants.length})</h3>
                {participants.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-6">Aun no hay participantes en esta cuenta.</p>
                ) : (
                  <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {participants.map((p, i) => (
                      <li key={p.id} className="bg-gradient-to-br from-gray-50 to-gray-100 px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-center font-medium shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 animate-scale-in" style={{ animationDelay: `${i * 60}ms` }}>
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
            <div className="grid lg:grid-cols-5 gap-6 animate-fade-in-up delay-200">
              <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6 h-fit">
                <h2 className="text-xl font-semibold mb-4">{editingExpenseId ? 'Editar Gasto' : 'Registrar Gasto'}</h2>
                <form onSubmit={saveExpense} className="space-y-4">
                  <FormError message={formError} />
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">Descripcion</label>
                    <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ej. Cena, Gasolina, Alquiler" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors hover:border-gray-300" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">Monto (Bs.)</label>
                    <input type="number" step="10" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="100" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors hover:border-gray-300" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">Quien pago?</label>
                    <select value={payerId} onChange={e => setPayerId(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white transition-colors hover:border-gray-300">
                      <option value="">Selecciona...</option>
                      {participants.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                    </select>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="block text-sm font-medium text-gray-600">Dividir entre</label>
                      <button type="button" onClick={() => setSelectedParticipants(participants.map(p => p.id))} className="text-xs text-blue-600 hover:underline font-medium">Seleccionar todos</button>
                    </div>
                    <div className="space-y-1 max-h-40 overflow-y-auto p-3 border border-gray-200 rounded-xl bg-gray-50">
                      {participants.length === 0 && <p className="text-xs text-gray-400 text-center py-2">Agrega participantes primero</p>}
                      {participants.map(p => (
                        <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer p-1.5 hover:bg-white rounded-lg transition-colors">
                          <input type="checkbox" checked={selectedParticipants.includes(p.id)} onChange={(e) => {
                            if (e.target.checked) setSelectedParticipants([...selectedParticipants, p.id]);
                            else setSelectedParticipants(selectedParticipants.filter(sid => sid !== p.id));
                          }} className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4" />
                          {p.name}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="submit" disabled={participants.length === 0} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-3 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-blue-500/20">
                      {editingExpenseId ? 'Guardar Cambios' : 'Guardar'}
                    </button>
                    {editingExpenseId && (
                      <button type="button" onClick={cancelEdit} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-4 py-3 rounded-xl transition-colors">Cancelar</button>
                    )}
                  </div>
                </form>
              </div>

              <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6">
                <h2 className="text-xl font-semibold mb-4">Historial de Gastos</h2>
                {expenses.length === 0 ? (
                  <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                    <Receipt className="mx-auto text-gray-300 mb-3" size={40} />
                    <p className="text-gray-500 font-medium">No hay gastos registrados</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {expenses.map((exp, i) => {
                      const payer = participants.find(p => p.id === exp.payer_id)?.name || 'Desconocido';
                      const expSplits = splits.filter(s => s.expense_id === exp.id);
                      return (
                        <div key={exp.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-4 rounded-xl border border-gray-100 hover:border-blue-200 hover:shadow-md transition-all duration-200 group gap-3 animate-slide-in-right" style={{ animationDelay: `${i * 60}ms` }}>
                          <div>
                            <p className="font-semibold text-gray-800 text-lg">{exp.description}</p>
                            <p className="text-sm text-gray-500 mt-1">{payer} pago <span className="font-bold text-gray-800">Bs. {exp.amount}</span></p>
                            <span className="inline-block text-xs text-gray-400 mt-1 bg-gray-100 px-2 py-0.5 rounded-full">Dividido entre {expSplits.length} {expSplits.length === 1 ? 'persona' : 'personas'}</span>
                          </div>
                          <div className="flex gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-all self-end sm:self-center">
                            <button onClick={() => startEditExpense(exp)} className="text-blue-500 hover:text-blue-700 p-2.5 rounded-xl hover:bg-blue-50 bg-gray-50 sm:bg-transparent transition-colors" title="Editar"><Edit2 size={18} /></button>
                            <button onClick={() => handleDeleteExpense(exp.id)} className="text-red-400 hover:text-red-600 p-2.5 rounded-xl hover:bg-red-50 bg-gray-50 sm:bg-transparent transition-colors" title="Eliminar"><Trash2 size={18} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* LIQUIDACION TAB */}
          {activeTab === 'balances' && (
            <div className="grid md:grid-cols-2 gap-6 animate-fade-in-up delay-200">
              {/* Balances */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold">Balances</h2>
                  {!isBalanceZero && (
                    <span className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-full font-medium flex items-center gap-1">
                      <AlertCircle size={12} /> Error: {balanceSum.toFixed(2)}
                    </span>
                  )}
                </div>
                <ul className="space-y-3">
                  {balances.map((b, i) => (
                    <li key={b.participantId} className="flex justify-between items-center p-4 rounded-xl bg-gradient-to-r from-gray-50 to-gray-100/50 border border-gray-100 animate-slide-in-left" style={{ animationDelay: `${i * 80}ms` }}>
                      <span className="font-medium text-gray-800">{b.name}</span>
                      <span className={`font-bold text-lg ${b.balance > 0 ? 'text-green-600' : b.balance < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                        {b.balance > 0 ? '+' : ''}{b.balance.toFixed(2)} Bs.
                      </span>
                    </li>
                  ))}
                  {balances.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No hay datos suficientes</p>}
                </ul>
                <div className="mt-6 text-xs text-gray-600 p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <strong className="text-blue-800 text-sm block mb-2">Como leer esto</strong>
                  <ul className="list-disc pl-4 space-y-1">
                    <li><span className="text-green-600 font-medium">Verde (+)</span>: A esta persona le deben dinero.</li>
                    <li><span className="text-red-500 font-medium">Rojo (-)</span>: Esta persona debe dinero.</li>
                  </ul>
                </div>
              </div>

              {/* Settlements */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6">
                <h2 className="text-xl font-semibold mb-6">Como quedar a mano</h2>
                {settlements.length === 0 ? (
                  <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                    <p className="text-gray-700 font-medium text-lg">Estan todos a mano</p>
                    <p className="text-sm text-gray-400 mt-1">No hay deudas pendientes.</p>
                  </div>
                ) : (
                  <ul className="space-y-4">
                    {settlements.map((t, i) => (
                      <li key={i} className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 p-5 rounded-xl bg-gradient-to-r from-red-50/50 via-white to-green-50/50 border border-gray-200 shadow-sm animate-scale-in" style={{ animationDelay: `${i * 100}ms` }}>
                        <div className="w-full sm:w-1/3 text-center sm:text-right font-semibold text-red-600 text-lg">{t.from}</div>
                        <div className="flex flex-col items-center justify-center w-full sm:w-1/3">
                          <span className="text-xs text-gray-400 font-semibold uppercase tracking-widest mb-1">paga a</span>
                          <div className="hidden sm:block w-full h-px bg-gradient-to-r from-red-300 via-gray-300 to-green-300 relative">
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 border-t-2 border-r-2 border-green-400 transform rotate-45 translate-x-1"></div>
                          </div>
                          <span className="font-bold text-gray-800 mt-2 text-base bg-white px-4 py-1.5 rounded-full border border-gray-200 shadow-sm">Bs. {t.amount.toFixed(2)}</span>
                        </div>
                        <div className="w-full sm:w-1/3 text-center sm:text-left font-semibold text-green-600 text-lg">{t.to}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
