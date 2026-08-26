import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { calculateBalances, calculateSettlement } from './utils';
import type { Group, Participant, Expense, ExpenseSplit } from './utils';
import { Trash2, Edit2, Plus, Users, Receipt, Calculator, AlertCircle, FolderOpen, X as XIcon, ArrowRight, PieChart } from 'lucide-react';
import { Navbar, ConfirmModal, FormError, useConfirmModal } from './components';

export default function CuentaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [group, setGroup] = useState<Group | null>(null);
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
  const [formError, setFormError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'participants' | 'expenses' | 'balances'>('participants');
  const { modal, showConfirm, closeConfirm } = useConfirmModal();

  useEffect(() => { if (id) fetchAll(id); }, [id]);
  useEffect(() => { setFormError(null); }, [activeTab]);

  async function fetchAll(groupId: string) {
    setLoading(true);
    try {
      const { data: gData } = await supabase.from('groups').select('*').eq('id', groupId).single();
      const { data: pData } = await supabase.from('participants').select('*').eq('group_id', groupId).order('created_at', { ascending: true });
      const { data: eData } = await supabase.from('expenses').select('*').eq('group_id', groupId).order('created_at', { ascending: false });
      const { data: sData } = await supabase.from('expense_splits').select('*');
      if (!gData) { navigate('/cuentas'); return; }
      setGroup(gData);
      setParticipants(pData || []);
      setExpenses(eData || []);
      setSplits(sData || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }

  async function addParticipant(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!newParticipantName.trim()) { setFormError('Ingresa el nombre del participante.'); return; }
    try {
      const { data, error } = await supabase.from('participants').insert([{ name: newParticipantName.trim(), group_id: id }]).select();
      if (error) throw error;
      setParticipants([...participants, data[0]]);
      setNewParticipantName('');
    } catch (err: any) { setFormError('Error al agregar participante.'); }
  }

  function handleDeleteParticipant(participant: Participant) {
    const balances = calculateBalances(participants, expenses, splits);
    const balance = balances.find(b => b.participantId === participant.id);

    if (balance && balance.balance < -0.01) {
      setFormError(`No se puede eliminar a "${participant.name}" porque tiene una deuda pendiente de Bs. ${Math.abs(balance.balance).toFixed(2)}.`);
      return;
    }

    const isPayerOfExpense = expenses.some(exp => exp.payer_id === participant.id);
    if (isPayerOfExpense) {
      setFormError(`No se puede eliminar a "${participant.name}" porque es pagador de uno o mas gastos. Elimina esos gastos primero.`);
      return;
    }

    showConfirm('Eliminar Participante', `Se eliminara a "${participant.name}" de esta cuenta.`, async () => {
      try {
        const { error } = await supabase.from('participants').delete().eq('id', participant.id);
        if (error) throw error;
        setParticipants(participants.filter(p => p.id !== participant.id));
        setSplits(splits.filter(s => s.participant_id !== participant.id));
      } catch (err: any) {
        setFormError('Error al eliminar participante.');
      }
    });
  }

  async function saveExpense(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!description.trim()) { setFormError('La descripcion es obligatoria.'); return; }
    if (!amount || parseFloat(amount) <= 0) { setFormError('Ingresa un monto valido.'); return; }
    if (!payerId) { setFormError('Selecciona quien pago.'); return; }
    if (selectedParticipants.length === 0) { setFormError('Selecciona al menos un participante.'); return; }

    try {
      if (editingExpenseId) {
        const { error: expError } = await supabase.from('expenses').update({ description: description.trim(), amount: parseFloat(amount), payer_id: payerId }).eq('id', editingExpenseId);
        if (expError) throw expError;
        await supabase.from('expense_splits').delete().eq('expense_id', editingExpenseId);
        const { data: splData, error: splError } = await supabase.from('expense_splits').insert(selectedParticipants.map(pId => ({ expense_id: editingExpenseId, participant_id: pId }))).select();
        if (splError) throw splError;
        setExpenses(expenses.map(exp => exp.id === editingExpenseId ? { ...exp, description: description.trim(), amount: parseFloat(amount), payer_id: payerId } : exp));
        setSplits([...splits.filter(s => s.expense_id !== editingExpenseId), ...(splData || [])]);
        setEditingExpenseId(null);
      } else {
        const { data: expData, error: expError } = await supabase.from('expenses').insert([{ group_id: id, description: description.trim(), amount: parseFloat(amount), payer_id: payerId }]).select();
        if (expError) throw expError;
        const newExp = expData[0];
        const { data: splData, error: splError } = await supabase.from('expense_splits').insert(selectedParticipants.map(pId => ({ expense_id: newExp.id, participant_id: pId }))).select();
        if (splError) throw splError;
        setExpenses([newExp, ...expenses]);
        setSplits([...splits, ...(splData || [])]);
      }
      setDescription(''); setAmount('');
    } catch (err: any) { setFormError('Error guardando gasto.'); }
  }

  function startEditExpense(exp: Expense) {
    setFormError(null);
    setEditingExpenseId(exp.id);
    setDescription(exp.description);
    setAmount(exp.amount.toString());
    setPayerId(exp.payer_id);
    setSelectedParticipants(splits.filter(s => s.expense_id === exp.id).map(s => s.participant_id));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() { setFormError(null); setEditingExpenseId(null); setDescription(''); setAmount(''); }

  function handleDeleteExpense(expenseId: string) {
    showConfirm('Eliminar Gasto', 'Esto afectara los balances de los participantes.', async () => {
      try {
        await supabase.from('expenses').delete().eq('id', expenseId);
        setExpenses(expenses.filter(e => e.id !== expenseId));
        setSplits(splits.filter(s => s.expense_id !== expenseId));
      } catch (err: any) { /* silent */ }
    });
  }

  const balances = calculateBalances(participants, expenses, splits);
  const settlements = calculateSettlement(balances);
  const balanceSum = balances.reduce((sum, b) => sum + b.balance, 0);
  const isBalanceZero = Math.abs(balanceSum) < 0.01;

  // Resumen Data
  const totalGasto = expenses.reduce((sum, e) => sum + e.amount, 0);
  const promedioPersona = participants.length > 0 ? totalGasto / participants.length : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)] transition-colors">
        <Navbar backLabel="Mis cuentas" backTo="/cuentas" />
        <div className="p-8 text-center text-[var(--text-muted)]">Cargando...</div>
      </div>
    );
  }

  const tabs = [
    { key: 'participants' as const, label: 'Participantes', icon: <Users size={16} /> },
    { key: 'expenses' as const, label: 'Gastos', icon: <Receipt size={16} /> },
    { key: 'balances' as const, label: 'Liquidacion', icon: <Calculator size={16} /> },
  ];

  const allSelected = participants.length > 0 && selectedParticipants.length === participants.length;

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] transition-colors">
      <Navbar backLabel="Mis cuentas" backTo="/cuentas" />
      <ConfirmModal isOpen={modal.isOpen} title={modal.title} message={modal.message} onConfirm={modal.onConfirm} onCancel={closeConfirm} />

      <div className="max-w-5xl mx-auto px-4 md:px-8 pb-12 animate-fade-in">

        {/* Header con Resumen (Nueva Funcionalidad) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-50 dark:bg-indigo-500/10 p-2.5 rounded-xl text-indigo-500">
              <FolderOpen size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)]">{group?.name}</h1>
              <p className="text-xs text-[var(--text-muted)]">{participants.length} participantes / {expenses.length} gastos</p>
            </div>
          </div>
          
          <div className="flex bg-[var(--bg-card)] border border-[var(--border)] rounded-xl divide-x divide-[var(--border)] overflow-hidden shadow-sm">
            <div className="px-4 py-2 flex flex-col justify-center">
              <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Gasto Total</span>
              <span className="text-sm font-bold text-[var(--text-primary)]">Bs. {totalGasto.toFixed(2)}</span>
            </div>
            <div className="px-4 py-2 flex flex-col justify-center">
              <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Promedio / Persona</span>
              <span className="text-sm font-bold text-[var(--text-primary)]">Bs. {promedioPersona.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-[var(--bg-card)] p-1 rounded-xl border border-[var(--border)] transition-colors overflow-x-auto">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex-1 flex justify-center items-center gap-1.5 py-2.5 px-3 rounded-lg transition-colors text-sm font-medium whitespace-nowrap ${activeTab === tab.key ? 'bg-indigo-500 text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}`}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* PARTICIPANTES */}
        {activeTab === 'participants' && (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl transition-colors">
            <div className="p-4 sm:p-5 border-b border-[var(--border)]">
              <h2 className="text-base font-semibold text-[var(--text-primary)] mb-3">Agregar Participante</h2>
              <form onSubmit={addParticipant}>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input type="text" value={newParticipantName} onChange={e => setNewParticipantName(e.target.value)} placeholder="Nombre (ej. Ana)" className="flex-1 px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors placeholder:text-[var(--text-muted)]" />
                  <button type="submit" className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-1.5 text-sm font-medium transition-colors">
                    <Plus size={16} /> Agregar
                  </button>
                </div>
                <FormError message={formError} />
              </form>
            </div>
            <div className="p-4 sm:p-5">
              <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">Participantes ({participants.length})</p>
              {participants.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] text-center py-4">Sin participantes</p>
              ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {participants.map(p => {
                    const pBalance = balances.find(b => b.participantId === p.id);
                    const hasDebt = pBalance && pBalance.balance < -0.01;
                    return (
                      <li key={p.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] group/p transition-colors">
                        <span className="text-sm font-medium text-[var(--text-primary)] truncate pr-2">{p.name}</span>
                        <button
                          onClick={() => handleDeleteParticipant(p)}
                          className={`p-1 rounded-md transition-all sm:opacity-0 group-hover/p:opacity-100 ${hasDebt ? 'text-[var(--text-muted)] cursor-not-allowed' : 'text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'}`}
                          title={hasDebt ? 'No se puede eliminar: tiene deuda' : 'Eliminar'}
                        >
                          {hasDebt ? <AlertCircle size={14} /> : <XIcon size={14} />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* GASTOS */}
        {activeTab === 'expenses' && (
          <div className="grid lg:grid-cols-5 gap-4">
            {/* Form */}
            <div className="lg:col-span-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 sm:p-5 h-fit transition-colors">
              <h2 className="text-base font-semibold text-[var(--text-primary)] mb-3">{editingExpenseId ? 'Editar Gasto' : 'Nuevo Gasto'}</h2>
              <form onSubmit={saveExpense} className="space-y-3">
                <FormError message={formError} />
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Descripcion</label>
                  <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ej. Cena" className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors placeholder:text-[var(--text-muted)]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Monto (Bs.)</label>
                  <input type="number" step="10" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="100" className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors placeholder:text-[var(--text-muted)]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Quien pago</label>
                  <select value={payerId} onChange={e => setPayerId(e.target.value)} className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors">
                    <option value="">Selecciona...</option>
                    {participants.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                  </select>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-medium text-[var(--text-secondary)]">Dividir entre</label>
                    <button 
                      type="button" 
                      onClick={() => setSelectedParticipants(allSelected ? [] : participants.map(p => p.id))} 
                      className="text-xs text-indigo-500 hover:underline font-medium"
                    >
                      {allSelected ? 'Deseleccionar todos' : 'Todos'}
                    </button>
                  </div>
                  <div className="space-y-0.5 max-h-40 overflow-y-auto p-2 border border-[var(--border)] rounded-lg bg-[var(--bg-secondary)] custom-scrollbar">
                    {participants.length === 0 && <p className="text-xs text-[var(--text-muted)] text-center py-2">Agrega participantes primero</p>}
                    {participants.map(p => (
                      <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer p-1.5 hover:bg-[var(--bg-card)] rounded-md transition-colors">
                        <input type="checkbox" checked={selectedParticipants.includes(p.id)} onChange={(e) => {
                          if (e.target.checked) setSelectedParticipants([...selectedParticipants, p.id]);
                          else setSelectedParticipants(selectedParticipants.filter(sid => sid !== p.id));
                        }} className="rounded text-indigo-500 focus:ring-indigo-500 w-3.5 h-3.5" />
                        <span className="text-[var(--text-primary)] truncate">{p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="submit" disabled={participants.length === 0} className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white font-medium px-4 py-2.5 text-sm rounded-lg transition-colors disabled:opacity-40">
                    {editingExpenseId ? 'Guardar' : 'Agregar'}
                  </button>
                  {editingExpenseId && (
                    <button type="button" onClick={cancelEdit} className="flex-1 bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-medium px-4 py-2.5 text-sm rounded-lg transition-colors hover:bg-[var(--border)]">Cancelar</button>
                  )}
                </div>
              </form>
            </div>

            {/* List */}
            <div className="lg:col-span-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 sm:p-5 transition-colors">
              <h2 className="text-base font-semibold text-[var(--text-primary)] mb-3">Historial</h2>
              {expenses.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-[var(--border)] rounded-lg">
                  <Receipt className="mx-auto text-[var(--text-muted)] mb-2" size={28} />
                  <p className="text-sm text-[var(--text-muted)]">Sin gastos</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {expenses.map(exp => {
                    const payer = participants.find(p => p.id === exp.payer_id)?.name || '?';
                    const expSplits = splits.filter(s => s.expense_id === exp.id);
                    return (
                      <div key={exp.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-3 rounded-lg border border-[var(--border)] hover:border-indigo-200 dark:hover:border-indigo-500/30 transition-colors group gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-[var(--text-primary)] text-sm truncate">{exp.description}</p>
                          <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">{payer} pago <span className="font-semibold text-[var(--text-primary)]">Bs. {exp.amount}</span> -- {expSplits.length} pers.</p>
                        </div>
                        <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity self-end sm:self-center shrink-0">
                          <button onClick={() => startEditExpense(exp)} className="text-indigo-400 hover:text-indigo-600 p-1.5 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors" title="Editar"><Edit2 size={14} /></button>
                          <button onClick={() => handleDeleteExpense(exp.id)} className="text-red-400 hover:text-red-600 p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors" title="Eliminar"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* LIQUIDACION */}
        {activeTab === 'balances' && (
          <div className="grid md:grid-cols-2 gap-4">
            {/* Balances */}
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 sm:p-5 transition-colors">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-base font-semibold text-[var(--text-primary)]">Balances</h2>
                {!isBalanceZero && <span className="text-xs bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 px-2 py-1 rounded-full font-medium"><AlertCircle size={10} className="inline mr-1" />Error: {balanceSum.toFixed(2)}</span>}
              </div>
              <ul className="space-y-2">
                {balances.map(b => (
                  <li key={b.participantId} className="flex justify-between items-center p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
                    <span className="text-sm font-medium text-[var(--text-primary)] truncate pr-2">{b.name}</span>
                    <span className={`text-sm font-bold shrink-0 ${b.balance > 0 ? 'text-emerald-500' : b.balance < 0 ? 'text-red-500' : 'text-[var(--text-muted)]'}`}>
                      {b.balance > 0 ? '+' : ''}{b.balance.toFixed(2)} Bs.
                    </span>
                  </li>
                ))}
                {balances.length === 0 && <p className="text-sm text-[var(--text-muted)] text-center py-3">Sin datos</p>}
              </ul>
              <div className="mt-4 text-xs text-[var(--text-secondary)] p-3 bg-indigo-50 dark:bg-indigo-500/5 rounded-lg border border-indigo-100 dark:border-indigo-500/10">
                <p className="font-medium text-indigo-600 dark:text-indigo-400 mb-1">Referencia</p>
                <p><span className="text-emerald-500 font-medium">Verde (+)</span> = le deben dinero</p>
                <p><span className="text-red-500 font-medium">Rojo (-)</span> = debe dinero</p>
              </div>
            </div>

            {/* Settlements */}
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 sm:p-5 transition-colors">
              <h2 className="text-base font-semibold text-[var(--text-primary)] mb-4">Transferencias</h2>
              {settlements.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-[var(--border)] rounded-lg">
                  <p className="text-sm font-medium text-[var(--text-primary)]">Todos a mano</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">No hay deudas pendientes</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {settlements.map((t, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
                      <span className="text-sm font-semibold text-red-500 flex-1 truncate text-right">{t.from}</span>
                      <div className="flex flex-col items-center shrink-0">
                        <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-0.5">paga</span>
                        <div className="flex items-center gap-1.5 bg-[var(--bg-card)] px-2.5 py-1 rounded-md border border-[var(--border)]">
                          <span className="text-sm font-bold text-[var(--text-primary)] whitespace-nowrap">Bs. {t.amount.toFixed(2)}</span>
                          <ArrowRight size={14} className="text-[var(--text-muted)]" />
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-emerald-500 flex-1 truncate text-left">{t.to}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
