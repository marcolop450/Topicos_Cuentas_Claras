import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { calculateBalances, calculateSettlement } from './utils';
import type { Group, Participant, Expense, ExpenseSplit } from './utils';
import { Trash2, Edit2, Users, Receipt, Calculator, AlertCircle, FolderOpen, ArrowRight, MessageCircle, RefreshCw } from 'lucide-react';
import { Navbar, ConfirmModal, FormError, useConfirmModal } from './components';
import { useAuth } from './hooks/useAuth';
import {
  fetchRatesFromUSD,
  toUSD,
  formatOriginal,
  formatUSD,
  SUPPORTED_CURRENCIES,
} from './hooks/useExchangeRates';
import type { RatesMap } from './hooks/useExchangeRates';

type GroupFull = Group & { join_code: string; owner_id: string };

export default function CuentaDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  // Extract join code: last 6 chars after the last dash
  const joinCode = slug ? slug.slice(-6).toUpperCase() : '';

  const [group, setGroup] = useState<GroupFull | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [splits, setSplits] = useState<ExpenseSplit[]>([]);

  // Tipos de cambio
  const [rates, setRates] = useState<RatesMap>({ USD: 1 });
  const [ratesFromFallback, setRatesFromFallback] = useState(false);
  const [ratesLoading, setRatesLoading] = useState(false);
  const ratesLoadedRef = useRef(false);

  // Formulario de gasto
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('BOB');
  const [payerId, setPayerId] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'participants' | 'expenses' | 'balances'>('participants');
  const { modal, showConfirm, closeConfirm } = useConfirmModal();

  useEffect(() => { if (joinCode) fetchAll(joinCode); }, [joinCode]);
  useEffect(() => { setFormError(null); }, [activeTab]);

  async function loadRates() {
    setRatesLoading(true);
    try {
      const result = await fetchRatesFromUSD();
      setRates(result.rates);
      setRatesFromFallback(result.fromFallback);
    } finally {
      setRatesLoading(false);
    }
  }

  async function fetchAll(code: string) {
    setLoading(true);
    try {
      // Cargar tasas de cambio (una sola vez por sesion)
      if (!ratesLoadedRef.current) {
        ratesLoadedRef.current = true;
        const result = await fetchRatesFromUSD();
        setRates(result.rates);
        setRatesFromFallback(result.fromFallback);
      }

      const { data: found } = await supabase.rpc('find_group_by_code', { p_code: code });
      if (!found || found.length === 0) { navigate('/cuentas'); return; }
      const groupId = found[0].id;

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

  async function handleLeaveGroup() {
    if (!user || !group) return;

    const myParticipant = participants.find(p => p.user_id === user.id);
    if (myParticipant) {
      const balances = calculateBalances(participants, expenses, splits);
      const myBalance = balances.find(b => b.participantId === myParticipant.id);

      if (myBalance && Math.abs(myBalance.balance) > 0.01) {
        if (myBalance.balance > 0) {
          setFormError(`No puedes salir: la sala te debe ${formatUSD(myBalance.balance)}.`);
        } else {
          setFormError(`No puedes salir: tienes una deuda de ${formatUSD(Math.abs(myBalance.balance))}.`);
        }
        return;
      }
    }

    showConfirm('Salir de la sala', '¿Seguro que quieres abandonar esta sala?', async () => {
      try {
        await supabase.from('group_members').delete().eq('group_id', group.id).eq('user_id', user.id);
        navigate('/cuentas');
      } catch {
        setFormError('Error al salir de la sala.');
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

    const parsedAmount = parseFloat(amount);
    const computedAmountUsd = toUSD(parsedAmount, currency, rates);

    try {
      if (editingExpenseId) {
        await supabase.from('expenses').update({
          description: description.trim(),
          amount: parsedAmount,
          currency,
          amount_usd: computedAmountUsd,
          payer_id: payerId,
        }).eq('id', editingExpenseId);
        await supabase.from('expense_splits').delete().eq('expense_id', editingExpenseId);
        const { data: splData } = await supabase
          .from('expense_splits')
          .insert(selectedParticipants.map(pId => ({ expense_id: editingExpenseId, participant_id: pId })))
          .select();
        setExpenses(expenses.map(exp =>
          exp.id === editingExpenseId
            ? { ...exp, description: description.trim(), amount: parsedAmount, currency, amount_usd: computedAmountUsd, payer_id: payerId }
            : exp
        ));
        setSplits([...splits.filter(s => s.expense_id !== editingExpenseId), ...(splData || [])]);
        setEditingExpenseId(null);
      } else {
        const { data: expData } = await supabase
          .from('expenses')
          .insert([{
            group_id: group?.id,
            description: description.trim(),
            amount: parsedAmount,
            currency,
            amount_usd: computedAmountUsd,
            payer_id: payerId,
          }])
          .select();
        const newExp = expData![0];
        const { data: splData } = await supabase
          .from('expense_splits')
          .insert(selectedParticipants.map(pId => ({ expense_id: newExp.id, participant_id: pId })))
          .select();
        setExpenses([newExp, ...expenses]);
        setSplits([...splits, ...(splData || [])]);
      }
      setDescription('');
      setAmount('');
      setCurrency('BOB');
    } catch { setFormError('Error guardando gasto.'); }
  }

  function startEditExpense(exp: Expense) {
    setFormError(null);
    setEditingExpenseId(exp.id);
    setDescription(exp.description);
    setAmount(exp.amount.toString());
    setCurrency(exp.currency || 'BOB');
    setPayerId(exp.payer_id);
    setSelectedParticipants(splits.filter(s => s.expense_id === exp.id).map(s => s.participant_id));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setFormError(null);
    setEditingExpenseId(null);
    setDescription('');
    setAmount('');
    setCurrency('BOB');
  }

  function handleDeleteExpense(expenseId: string) {
    showConfirm('Eliminar Gasto', 'Esto afectara los balances de los participantes.', async () => {
      await supabase.from('expenses').delete().eq('id', expenseId);
      setExpenses(expenses.filter(e => e.id !== expenseId));
      setSplits(splits.filter(s => s.expense_id !== expenseId));
    });
  }

  const balances = calculateBalances(participants, expenses, splits);
  const settlements = calculateSettlement(balances);
  const balanceSum = balances.reduce((sum, b) => sum + b.balance, 0);
  const isBalanceZero = Math.abs(balanceSum) < 0.01;

  // Total consolidado en USD
  const totalUSD = expenses.reduce((sum, e) => {
    const usd = e.amount_usd > 0 ? e.amount_usd : toUSD(e.amount, e.currency || 'BOB', rates);
    return sum + usd;
  }, 0);

  const isOwner = group?.owner_id === user?.id;
  const allSelected = participants.length > 0 && selectedParticipants.length === participants.length;

  // Equivalente USD del monto ingresado en el formulario (preview)
  const previewUSD = amount && parseFloat(amount) > 0
    ? toUSD(parseFloat(amount), currency, rates)
    : 0;

  function shareToWhatsApp() {
    let text = `*Resumen - ${group?.name}*\nGasto total: ${formatUSD(totalUSD)}\n\n`;
    if (settlements.length === 0) {
      text += 'Todos a mano. No hay deudas.';
    } else {
      text += '*Transferencias (en USD):*\n';
      settlements.forEach(t => { text += `${t.from} -> ${formatUSD(t.amount)} -> ${t.to}\n`; });
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)] transition-colors">
        <Navbar backLabel="Mis salas" backTo="/cuentas" onSignOut={signOut} />
        <div className="p-8 text-center text-[var(--text-muted)]">Cargando...</div>
      </div>
    );
  }

  const tabs = [
    { key: 'participants' as const, label: 'Participantes', icon: <Users size={15} /> },
    { key: 'expenses' as const, label: 'Gastos', icon: <Receipt size={15} /> },
    { key: 'balances' as const, label: 'Liquidacion', icon: <Calculator size={15} /> },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] transition-colors">
      <Navbar backLabel="Mis salas" backTo="/cuentas" userName={user?.user_metadata?.name || user?.email} onSignOut={signOut} />
      <ConfirmModal isOpen={modal.isOpen} title={modal.title} message={modal.message} onConfirm={modal.onConfirm} onCancel={closeConfirm} />

      <div className="max-w-5xl mx-auto px-4 md:px-8 pb-12 animate-fade-in">

        {/* Aviso de tasas de respaldo */}
        {ratesFromFallback && (
          <div className="mb-4 flex items-center gap-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs px-3 py-2.5 rounded-lg">
            <AlertCircle size={14} className="shrink-0" />
            <span>Tasas de cambio estimadas (sin conexion a la API). Los montos en USD son aproximados.</span>
            <button
              onClick={loadRates}
              disabled={ratesLoading}
              className="ml-auto flex items-center gap-1 font-medium underline hover:no-underline shrink-0"
            >
              <RefreshCw size={12} className={ratesLoading ? 'animate-spin' : ''} />
              Reintentar
            </button>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-50 dark:bg-indigo-500/10 p-2.5 rounded-xl text-indigo-500 shrink-0">
              <FolderOpen size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-[var(--text-primary)]">{group?.name}</h1>
                {isOwner && <span className="text-[10px] bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded font-semibold">DUEÑO</span>}
              </div>
              <p className="text-xs text-[var(--text-muted)]">{participants.length} participantes / {expenses.length} gastos</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2">
              <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Codigo</span>
              <span className="font-mono font-bold text-sm text-indigo-500 tracking-widest">{group?.join_code}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2">
              <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Total (USD)</span>
              <span className="font-bold text-sm text-[var(--text-primary)]">{formatUSD(totalUSD)}</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-[var(--bg-card)] p-1 rounded-xl border border-[var(--border)] transition-colors overflow-x-auto">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex-1 flex justify-center items-center gap-1.5 py-2.5 px-3 rounded-lg transition-colors text-sm font-medium whitespace-nowrap ${activeTab === tab.key ? 'bg-indigo-500 text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}`}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* PARTICIPANTES */}
        {activeTab === 'participants' && (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl transition-colors">
            {!isOwner && (
              <div className="p-4 sm:p-5 border-b border-[var(--border)] flex justify-between items-center">
                <div>
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">Salir de la sala</h2>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">Abandonar este grupo y eliminarte de la lista (si no tienes deudas).</p>
                </div>
                <button onClick={handleLeaveGroup} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0">
                  Salir
                </button>
              </div>
            )}

            <div className="p-4 sm:p-5">
              <FormError message={formError} />

              <div className="flex justify-between items-center mb-3 mt-1">
                <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Usuarios unidos ({participants.length})</p>
              </div>

              {participants.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] text-center py-4">Sin participantes</p>
              ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {participants.map(p => {
                    const isMe = p.user_id === user?.id;
                    const pBalance = balances.find(b => b.participantId === p.id);
                    const balanceVal = pBalance ? pBalance.balance : 0;

                    return (
                      <li key={p.id} className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${isMe ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/10' : 'border-[var(--border)] bg-[var(--bg-secondary)]'} transition-colors`}>
                        <span className={`text-sm font-medium truncate ${isMe ? 'text-indigo-600 dark:text-indigo-400' : 'text-[var(--text-primary)]'}`}>
                          {p.name} {isMe && '(Tu)'}
                        </span>

                        {Math.abs(balanceVal) > 0.01 && (
                          <span className={`text-xs font-bold shrink-0 ml-2 ${balanceVal > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {balanceVal > 0 ? '+' : ''}{formatUSD(Math.abs(balanceVal))}
                          </span>
                        )}
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
            <div className="lg:col-span-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 sm:p-5 h-fit transition-colors">
              <h2 className="text-base font-semibold text-[var(--text-primary)] mb-3">{editingExpenseId ? 'Editar Gasto' : 'Nuevo Gasto'}</h2>
              <form onSubmit={saveExpense} className="space-y-3">
                <FormError message={formError} />
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Descripcion</label>
                  <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ej. Cena" className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors placeholder:text-[var(--text-muted)]" />
                </div>

                {/* Monto + Moneda en la misma fila */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Monto y moneda</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 min-w-0 px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors placeholder:text-[var(--text-muted)]"
                    />
                    <select
                      value={currency}
                      onChange={e => setCurrency(e.target.value)}
                      className="px-2 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors font-medium"
                    >
                      {SUPPORTED_CURRENCIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  {/* Preview de conversion a USD */}
                  {previewUSD > 0 && currency !== 'USD' && (
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">
                      ≈ {formatUSD(previewUSD)} USD
                    </p>
                  )}
                  {currency !== 'USD' && !amount && (
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">
                      Tasa: 1 USD = {rates[currency]?.toFixed(4) ?? '—'} {currency}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Quien pago</label>
                  <select value={payerId} onChange={e => setPayerId(e.target.value)} className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors">
                    <option value="">Selecciona...</option>
                    {participants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-medium text-[var(--text-secondary)]">Dividir entre</label>
                    <button type="button" onClick={() => setSelectedParticipants(allSelected ? [] : participants.map(p => p.id))} className="text-xs text-indigo-500 hover:underline font-medium">
                      {allSelected ? 'Deseleccionar todos' : 'Todos'}
                    </button>
                  </div>
                  <div className="space-y-0.5 max-h-40 overflow-y-auto p-2 border border-[var(--border)] rounded-lg bg-[var(--bg-secondary)]">
                    {participants.length === 0 && <p className="text-xs text-[var(--text-muted)] text-center py-2">Agrega participantes primero</p>}
                    {participants.map(p => (
                      <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer p-1.5 hover:bg-[var(--bg-card)] rounded-md transition-colors">
                        <input type="checkbox" checked={selectedParticipants.includes(p.id)} onChange={e => {
                          if (e.target.checked) setSelectedParticipants([...selectedParticipants, p.id]);
                          else setSelectedParticipants(selectedParticipants.filter(s => s !== p.id));
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
                  {editingExpenseId && <button type="button" onClick={cancelEdit} className="flex-1 bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-medium px-4 py-2.5 text-sm rounded-lg transition-colors">Cancelar</button>}
                </div>
              </form>
            </div>

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
                    const expCurrency = exp.currency || 'BOB';
                    const expUsd = exp.amount_usd > 0 ? exp.amount_usd : toUSD(exp.amount, expCurrency, rates);
                    const showUsdConversion = expCurrency !== 'USD';
                    return (
                      <div key={exp.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-3 rounded-lg border border-[var(--border)] hover:border-indigo-200 dark:hover:border-indigo-500/30 transition-colors gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-[var(--text-primary)] text-sm truncate">{exp.description}</p>
                          <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                            {payer} pago{' '}
                            <span className="font-semibold text-[var(--text-primary)]">{formatOriginal(exp.amount, expCurrency)}</span>
                            {showUsdConversion && (
                              <span className="text-[var(--text-muted)]"> ({formatUSD(expUsd)})</span>
                            )}
                            {' '}— {expSplits.length} pers.
                          </p>
                        </div>
                        <div className="flex gap-1 self-end sm:self-center shrink-0">
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
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 sm:p-5 transition-colors">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-base font-semibold text-[var(--text-primary)]">Balances (USD)</h2>
                {!isBalanceZero && <span className="text-xs bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 px-2 py-1 rounded-full font-medium"><AlertCircle size={10} className="inline mr-1" />Error: {balanceSum.toFixed(4)}</span>}
              </div>
              <ul className="space-y-2">
                {balances.map(b => (
                  <li key={b.participantId} className="flex justify-between items-center p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
                    <span className="text-sm font-medium text-[var(--text-primary)] truncate pr-2">{b.name}</span>
                    <span className={`text-sm font-bold shrink-0 ${b.balance > 0 ? 'text-emerald-500' : b.balance < 0 ? 'text-red-500' : 'text-[var(--text-muted)]'}`}>
                      {b.balance > 0 ? '+' : ''}{formatUSD(Math.abs(b.balance))}
                    </span>
                  </li>
                ))}
                {balances.length === 0 && <p className="text-sm text-[var(--text-muted)] text-center py-3">Sin datos</p>}
              </ul>
              <div className="mt-4 p-3 bg-indigo-50 dark:bg-indigo-500/5 rounded-lg border border-indigo-100 dark:border-indigo-500/10">
                <p className="font-medium text-xs text-indigo-600 dark:text-indigo-400 mb-1">Referencia</p>
                <p className="text-xs text-[var(--text-secondary)]"><span className="text-emerald-500 font-medium">Verde (+)</span> = le deben</p>
                <p className="text-xs text-[var(--text-secondary)]"><span className="text-red-500 font-medium">Rojo (-)</span> = debe</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">Todos los montos consolidados en USD.</p>
              </div>
            </div>

            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 sm:p-5 transition-colors">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-base font-semibold text-[var(--text-primary)]">Transferencias</h2>
                {settlements.length > 0 && (
                  <button onClick={shareToWhatsApp} className="flex items-center gap-1.5 text-xs font-medium bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 px-3 py-1.5 rounded-lg transition-colors">
                    <MessageCircle size={13} /> Compartir
                  </button>
                )}
              </div>
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
                          <span className="text-sm font-bold text-[var(--text-primary)] whitespace-nowrap">{formatUSD(t.amount)}</span>
                          <ArrowRight size={13} className="text-[var(--text-muted)]" />
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-emerald-500 flex-1 truncate">{t.to}</span>
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
