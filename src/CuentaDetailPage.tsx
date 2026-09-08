import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { calculateBalances, calculateSettlement } from './utils';
import type { Group, Participant, Expense, ExpenseSplit, SplitMode, Settlement, SettlementType } from './utils';
import { Trash2, Edit2, Users, Receipt, Calculator, AlertCircle, FolderOpen, ArrowRight, MessageCircle, RefreshCw, Clock, Check, X, Copy, CheckCheck } from 'lucide-react';
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
  const [settlementRecords, setSettlementRecords] = useState<Settlement[]>([]);
  const [copiedCode, setCopiedCode] = useState(false);

  // Tipos de cambio
  const [rates, setRates] = useState<RatesMap>({ USD: 1 });
  const [ratesFromFallback, setRatesFromFallback] = useState(false);
  const [ratesLoading, setRatesLoading] = useState(false);
  const ratesLoadedRef = useRef(false);

  // Formulario de gasto
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('BOB');
  const [payerId, setPayerId] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [splitMode, setSplitMode] = useState<SplitMode>('EQUAL');
  const [customShares, setCustomShares] = useState<Record<string, string>>({});
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  // Modal para liquidar deuda (pago o condonación)
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [settleFromId, setSettleFromId] = useState('');
  const [settleToId, setSettleToId] = useState('');
  const [settleAmount, setSettleAmount] = useState('');
  const [settleType, setSettleType] = useState<SettlementType>('PAYMENT');
  const [settleNotes, setSettleNotes] = useState('');
  const [settleLoading, setSettleLoading] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);

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
      let stData: Settlement[] = [];
      try {
        const { data } = await supabase.from('settlements').select('*').eq('group_id', groupId).order('created_at', { ascending: false });
        if (data) stData = data;
      } catch (e) {
        console.warn('Could not fetch settlements:', e);
      }

      if (!gData) { navigate('/cuentas'); return; }
      setGroup(gData);
      setParticipants(pData || []);
      setExpenses(eData || []);
      setSplits(sData || []);
      setSettlementRecords(stData);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }

  async function handleLeaveGroup() {
    if (!user || !group) return;

    const myParticipant = participants.find(p => p.user_id === user.id);
    if (myParticipant) {
      const balances = calculateBalances(participants, expenses, splits, settlementRecords);
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

    const parsedAmount = parseFloat(amount);
    const computedAmountUsd = toUSD(parsedAmount, currency, rates);

    let activeParticipants = selectedParticipants;
    if (splitMode === 'PERSONAL') {
      activeParticipants = [payerId];
    } else {
      if (activeParticipants.length === 0) {
        setFormError('Selecciona al menos un participante.');
        return;
      }
    }

    if (splitMode === 'PERCENTAGE') {
      const sumPct = activeParticipants.reduce((acc, pId) => acc + (parseFloat(customShares[pId] || '0') || 0), 0);
      if (Math.abs(sumPct - 100) > 0.1) {
        setFormError(`La suma de los porcentajes debe ser 100% (actual: ${sumPct.toFixed(1)}%).`);
        return;
      }
    }

    if (splitMode === 'CUSTOM') {
      const sumCustom = activeParticipants.reduce((acc, pId) => acc + (parseFloat(customShares[pId] || '0') || 0), 0);
      if (Math.abs(sumCustom - parsedAmount) > 0.05) {
        setFormError(`La suma de los montos debe ser igual al total ${parsedAmount.toFixed(2)} ${currency} (actual: ${sumCustom.toFixed(2)}).`);
        return;
      }
    }

    try {
      if (editingExpenseId) {
        await supabase.from('expenses').update({
          description: description.trim(),
          notes: notes.trim(),
          amount: parsedAmount,
          currency,
          amount_usd: computedAmountUsd,
          payer_id: payerId,
          split_mode: splitMode,
        }).eq('id', editingExpenseId);

        await supabase.from('expense_splits').delete().eq('expense_id', editingExpenseId);

        const splitsPayload = activeParticipants.map(pId => ({
          expense_id: editingExpenseId,
          participant_id: pId,
          share_value: (splitMode === 'PERCENTAGE' || splitMode === 'CUSTOM')
            ? parseFloat(customShares[pId] || '0')
            : null,
        }));

        const { data: splData } = await supabase
          .from('expense_splits')
          .insert(splitsPayload)
          .select();

        setExpenses(expenses.map(exp =>
          exp.id === editingExpenseId
            ? { ...exp, description: description.trim(), notes: notes.trim(), amount: parsedAmount, currency, amount_usd: computedAmountUsd, payer_id: payerId, split_mode: splitMode }
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
            notes: notes.trim(),
            amount: parsedAmount,
            currency,
            amount_usd: computedAmountUsd,
            payer_id: payerId,
            split_mode: splitMode,
          }])
          .select();

        const newExp = expData![0];

        const splitsPayload = activeParticipants.map(pId => ({
          expense_id: newExp.id,
          participant_id: pId,
          share_value: (splitMode === 'PERCENTAGE' || splitMode === 'CUSTOM')
            ? parseFloat(customShares[pId] || '0')
            : null,
        }));

        const { data: splData } = await supabase
          .from('expense_splits')
          .insert(splitsPayload)
          .select();

        setExpenses([newExp, ...expenses]);
        setSplits([...splits, ...(splData || [])]);
      }
      setDescription('');
      setNotes('');
      setAmount('');
      setCurrency('BOB');
      setSplitMode('EQUAL');
      setCustomShares({});
    } catch { setFormError('Error guardando gasto.'); }
  }

  function startEditExpense(exp: Expense) {
    setFormError(null);
    setEditingExpenseId(exp.id);
    setDescription(exp.description);
    setNotes(exp.notes || '');
    setAmount(exp.amount.toString());
    setCurrency(exp.currency || 'BOB');
    setPayerId(exp.payer_id);
    const mode = exp.split_mode || 'EQUAL';
    setSplitMode(mode);

    const expSplits = splits.filter(s => s.expense_id === exp.id);
    setSelectedParticipants(expSplits.map(s => s.participant_id));

    const shares: Record<string, string> = {};
    expSplits.forEach(s => {
      if (s.share_value != null) {
        shares[s.participant_id] = s.share_value.toString();
      }
    });
    setCustomShares(shares);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setFormError(null);
    setEditingExpenseId(null);
    setDescription('');
    setNotes('');
    setAmount('');
    setCurrency('BOB');
    setSplitMode('EQUAL');
    setCustomShares({});
  }

  function handleDeleteExpense(expenseId: string) {
    showConfirm('Eliminar Gasto', 'Esto afectara los balances de los participantes.', async () => {
      try {
        const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
        if (error) {
          setFormError('Error al eliminar gasto: ' + error.message);
          return;
        }
        const updatedExpenses = expenses.filter(e => e.id !== expenseId);
        setExpenses(updatedExpenses);
        setSplits(splits.filter(s => s.expense_id !== expenseId));

        // Si ya no quedan gastos, limpiar automáticamente las liquidaciones huérfanas
        if (updatedExpenses.length === 0 && settlementRecords.length > 0 && group?.id) {
          await supabase.from('settlements').delete().eq('group_id', group.id);
          setSettlementRecords([]);
        }
      } catch (err: any) {
        setFormError('Error al eliminar gasto: ' + (err.message || err));
      }
    });
  }

  async function handleDeleteSettlement(settlementId: string) {
    showConfirm('Eliminar Liquidacion', '¿Deseas eliminar este registro de pago o condonacion?', async () => {
      try {
        const { error } = await supabase.from('settlements').delete().eq('id', settlementId);
        if (error) {
          setFormError('Error al eliminar liquidacion: ' + error.message);
          return;
        }
        setSettlementRecords(settlementRecords.filter(s => s.id !== settlementId));
      } catch (err: any) {
        setFormError('Error al eliminar liquidacion: ' + (err.message || err));
      }
    });
  }

  async function handleClearAllSettlements() {
    showConfirm('Reiniciar Liquidaciones', '¿Eliminar todos los registros de pago y perdon para dejar las deudas en cero?', async () => {
      try {
        if (!group?.id) return;
        const { error } = await supabase.from('settlements').delete().eq('group_id', group.id);
        if (error) {
          setFormError('Error al reiniciar liquidaciones: ' + error.message);
          return;
        }
        setSettlementRecords([]);
      } catch (err: any) {
        setFormError('Error: ' + (err.message || err));
      }
    });
  }

  // --- MUERTE A LA DEUDA: Funciones de Liquidación y Confirmación ---
  function openSettleModal(fromId: string, toId: string, defaultAmountUsd: number, type: SettlementType = 'PAYMENT') {
    setSettleFromId(fromId);
    setSettleToId(toId);
    // La liquidacion final se procesa y consolida estrictamente en DOLARES (USD)
    setSettleAmount(defaultAmountUsd.toFixed(2));
    const isDebtor = user && participants.find(p => p.id === fromId)?.user_id === user.id;
    // Un deudor NUNCA puede abrir el modal para perdonarse su propia deuda
    setSettleType(isDebtor ? 'PAYMENT' : type);
    setSettleNotes('');
    setSettleError(null);
    setSettleModalOpen(true);
  }

  async function handleConfirmPayment(settlementId: string) {
    try {
      await supabase.from('settlements').update({ status: 'CONFIRMED' }).eq('id', settlementId);
      setSettlementRecords(settlementRecords.map(s => s.id === settlementId ? { ...s, status: 'CONFIRMED' } : s));
    } catch {
      setFormError('Error al confirmar el pago.');
    }
  }

  async function handleRejectPayment(settlementId: string) {
    showConfirm('Rechazar Pago', '¿Confirmas que no recibiste este pago?', async () => {
      try {
        await supabase.from('settlements').update({ status: 'REJECTED' }).eq('id', settlementId);
        setSettlementRecords(settlementRecords.map(s => s.id === settlementId ? { ...s, status: 'REJECTED' } : s));
      } catch {
        setFormError('Error al rechazar el pago.');
      }
    });
  }

  async function handleSaveSettlement(e: React.FormEvent) {
    e.preventDefault();
    setSettleError(null);
    const parsed = parseFloat(settleAmount);
    if (!parsed || parsed <= 0) {
      setSettleError('Ingresa un monto valido.');
      return;
    }
    if (!settleFromId || !settleToId) {
      setSettleError('Datos incompletos.');
      return;
    }

    const debtorPart = participants.find(p => p.id === settleFromId);
    const creditorPart = participants.find(p => p.id === settleToId);
    const isCreditor = user && creditorPart?.user_id === user.id;
    const isDebtor = user && debtorPart?.user_id === user.id;

    // VALIDACION: Un deudor jamás puede perdonar su propia deuda
    if (settleType === 'FORGIVEN') {
      if (isDebtor) {
        setSettleError('No puedes perdonar tu propia deuda. Solo el acreedor tiene la potestad de condonarla.');
        return;
      }
      if (debtorPart?.user_id && !isCreditor && group?.owner_id !== user?.id) {
        setSettleError('Solo el acreedor puede condonar esta deuda.');
        return;
      }
    }

    setSettleLoading(true);
    // Liquidación final consolidada en USD ($)
    const usdAmount = parsed;

    // Si quien registra es el acreedor (sea perdonar o marcar cobrado en mano), queda CONFIRMED de inmediato.
    // Si quien registra es el deudor, queda PENDING para confirmación del acreedor.
    // Si es el dueño administrando por un participante sin cuenta, queda CONFIRMED.
    const initialStatus: 'PENDING' | 'CONFIRMED' =
      (settleType === 'FORGIVEN' || isCreditor || (!debtorPart?.user_id && group?.owner_id === user?.id))
        ? 'CONFIRMED'
        : 'PENDING';

    try {
      const { data, error } = await supabase.from('settlements').insert([{
        group_id: group?.id,
        from_id: settleFromId,
        to_id: settleToId,
        amount: parsed,
        currency: 'USD',
        amount_usd: usdAmount,
        settlement_type: settleType,
        status: initialStatus,
        notes: settleNotes.trim(),
      }]).select();

      if (error) throw error;
      if (data && data[0]) {
        setSettlementRecords([data[0], ...settlementRecords]);
      }
      setSettleModalOpen(false);
    } catch (err: any) {
      setSettleError(err.message || 'Error registrando la liquidacion. Verifica el script SQL.');
    } finally {
      setSettleLoading(false);
    }
  }

  const balances = calculateBalances(participants, expenses, splits, settlementRecords);
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

  function handleCopyCode() {
    if (!group?.join_code) return;
    navigator.clipboard.writeText(group.join_code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  function getInitials(name: string): string {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

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
      <div className="min-h-screen bg-[var(--bg-primary)] transition-colors">
        <Navbar backLabel="Mis salas" backTo="/cuentas" onSignOut={signOut} />
        <div className="p-8 text-center text-[var(--text-muted)] text-sm">Cargando detalles de la sala...</div>
      </div>
    );
  }

  const tabs = [
    { key: 'participants' as const, label: 'Participantes', icon: <Users size={15} /> },
    { key: 'expenses' as const, label: 'Gastos', icon: <Receipt size={15} /> },
    { key: 'balances' as const, label: 'Liquidacion', icon: <Calculator size={15} /> },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] transition-colors">
      <Navbar backLabel="Mis salas" backTo="/cuentas" userName={user?.user_metadata?.name || user?.email} onSignOut={signOut} />
      <ConfirmModal isOpen={modal.isOpen} title={modal.title} message={modal.message} onConfirm={modal.onConfirm} onCancel={closeConfirm} />

      <div className="max-w-5xl mx-auto px-4 md:px-8 pb-14 animate-in fade-in duration-200">

        {/* Aviso de tasas de respaldo */}
        {ratesFromFallback && (
          <div className="mb-4 flex items-center gap-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs px-3.5 py-2.5 rounded-xl">
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

        {/* Header con estilo fintech moderno */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 bg-[var(--bg-card)] p-4 sm:p-5 rounded-2xl border border-[var(--border)] shadow-xs">
          <div className="flex items-center gap-3.5">
            <div className="bg-gradient-to-tr from-indigo-600 to-indigo-400 p-3 rounded-2xl text-white shadow-xs shrink-0">
              <FolderOpen size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight">{group?.name}</h1>
                {isOwner && (
                  <span className="text-[10px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full font-bold">
                    ADMIN
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5 flex items-center gap-2">
                <span>{participants.length} {participants.length === 1 ? 'participante' : 'participantes'}</span>
                <span>•</span>
                <span>{expenses.length} {expenses.length === 1 ? 'gasto registrado' : 'gastos registrados'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={handleCopyCode}
              title="Copiar codigo de sala"
              className="flex items-center gap-2 bg-[var(--bg-secondary)] hover:bg-[var(--border)]/60 border border-[var(--border)] rounded-xl px-3 py-2 transition-all cursor-pointer group"
            >
              <div className="flex flex-col text-left">
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Codigo</span>
                <span className="font-mono font-bold text-sm text-indigo-500 tracking-wider">{group?.join_code}</span>
              </div>
              {copiedCode ? <CheckCheck size={16} className="text-emerald-500 ml-1 shrink-0" /> : <Copy size={15} className="text-[var(--text-muted)] group-hover:text-indigo-500 transition-colors ml-1 shrink-0" />}
            </button>

            <div className="flex flex-col bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl px-3.5 py-2">
              <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Total Gastado</span>
              <span className="font-bold text-sm text-[var(--text-primary)]">{formatUSD(totalUSD)}</span>
            </div>
          </div>
        </div>

        {/* Tabs Segmentados */}
        <div className="flex gap-1.5 mb-6 bg-[var(--bg-card)] p-1.5 rounded-2xl border border-[var(--border)] transition-colors shadow-2xs overflow-x-auto">
          {tabs.map(tab => {
            const isActive = activeTab === tab.key;
            let badgeCount: number | null = null;
            if (tab.key === 'participants') badgeCount = participants.length;
            if (tab.key === 'expenses') badgeCount = expenses.length;
            const pendingPayments = settlementRecords.filter(s => s.status === 'PENDING').length;

            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex justify-center items-center gap-2 py-2.5 px-3.5 rounded-xl transition-all text-xs sm:text-sm font-semibold whitespace-nowrap ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {badgeCount !== null && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'}`}>
                    {badgeCount}
                  </span>
                )}
                {tab.key === 'balances' && pendingPayments > 0 && (
                  <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold animate-pulse">
                    {pendingPayments}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* PARTICIPANTES */}
        {activeTab === 'participants' && (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 transition-colors shadow-xs space-y-4">
            {!isOwner && (
              <div className="p-4 border border-[var(--border)] rounded-xl flex justify-between items-center bg-[var(--bg-secondary)]">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">Salir de la sala</h2>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">Abandonar este grupo y eliminarte de la lista (si no tienes deudas pendientes).</p>
                </div>
                <button onClick={handleLeaveGroup} className="bg-red-500 hover:bg-red-600 text-white px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0">
                  Salir
                </button>
              </div>
            )}

            <FormError message={formError} />

            <div className="flex justify-between items-center">
              <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Miembros del grupo ({participants.length})</p>
            </div>

            {participants.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] text-center py-6">Sin participantes</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {participants.map(p => {
                  const isMe = p.user_id === user?.id;
                  const pBalance = balances.find(b => b.participantId === p.id);
                  const balanceVal = pBalance ? pBalance.balance : 0;

                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                        isMe
                          ? 'border-indigo-500/50 bg-indigo-500/5 shadow-xs'
                          : 'border-[var(--border)] bg-[var(--bg-secondary)]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                          isMe ? 'bg-indigo-600 text-white' : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border)]'
                        }`}>
                          {getInitials(p.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                            {p.name}
                          </p>
                          {isMe && <span className="text-[10px] text-indigo-500 font-medium">Tú</span>}
                        </div>
                      </div>

                      <div className="shrink-0">
                        {Math.abs(balanceVal) > 0.01 ? (
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                            balanceVal > 0.001
                              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                          }`}>
                            {balanceVal > 0.001 ? `+${formatUSD(balanceVal)}` : `-${formatUSD(Math.abs(balanceVal))}`}
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-[var(--text-muted)] bg-[var(--bg-card)] border border-[var(--border)] px-2.5 py-1 rounded-full">
                            Al día
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Titulo</label>
                  <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ej. Cena, Taxi, Hotel" className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors placeholder:text-[var(--text-muted)]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Descripcion / Notas (opcional)</label>
                  <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej. Pagado en efectivo, incluyo propina" className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors placeholder:text-[var(--text-muted)]" />
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
                  <select
                    value={payerId}
                    onChange={e => {
                      const newPayer = e.target.value;
                      setPayerId(newPayer);
                      if (splitMode === 'PERSONAL' && newPayer) {
                        setSelectedParticipants([newPayer]);
                      }
                    }}
                    className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                  >
                    <option value="">Selecciona...</option>
                    {participants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                {/* Selector de Modo de División */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Modo de division</label>
                  <div className="grid grid-cols-2 gap-1 p-1 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setSplitMode('EQUAL')}
                      className={`py-1.5 px-2 rounded-md transition-colors text-center truncate ${splitMode === 'EQUAL' ? 'bg-indigo-500 text-white shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                    >
                      Partes iguales
                    </button>
                    <button
                      type="button"
                      onClick={() => setSplitMode('PERCENTAGE')}
                      className={`py-1.5 px-2 rounded-md transition-colors text-center truncate ${splitMode === 'PERCENTAGE' ? 'bg-indigo-500 text-white shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                    >
                      Porcentaje (%)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSplitMode('CUSTOM')}
                      className={`py-1.5 px-2 rounded-md transition-colors text-center truncate ${splitMode === 'CUSTOM' ? 'bg-indigo-500 text-white shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                    >
                      Monto manual
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSplitMode('PERSONAL');
                        if (payerId) setSelectedParticipants([payerId]);
                      }}
                      className={`py-1.5 px-2 rounded-md transition-colors text-center truncate ${splitMode === 'PERSONAL' ? 'bg-indigo-500 text-white shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                    >
                      Por su cuenta
                    </button>
                  </div>
                </div>

                {splitMode === 'PERSONAL' ? (
                  <div className="p-3 bg-indigo-50/70 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 rounded-lg text-xs">
                    <p className="font-semibold text-indigo-700 dark:text-indigo-300 mb-0.5">Gasto personal (por su cuenta)</p>
                    <p className="text-[var(--text-secondary)]">
                      {payerId
                        ? `Asignado al 100% a ${participants.find(p => p.id === payerId)?.name || 'quien pago'}. Suma al total del viaje, pero no genera deudas con el grupo.`
                        : 'Selecciona arriba quien pago para asociar este gasto personal.'}
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-medium text-[var(--text-secondary)]">
                        {splitMode === 'PERCENTAGE' ? 'Asignar porcentajes' : splitMode === 'CUSTOM' ? `Asignar montos (${currency})` : 'Dividir entre'}
                      </label>
                      <div className="flex items-center gap-2">
                        {splitMode === 'PERCENTAGE' && selectedParticipants.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const equalPct = (100 / selectedParticipants.length).toFixed(1);
                              const newShares: Record<string, string> = { ...customShares };
                              selectedParticipants.forEach(pId => { newShares[pId] = equalPct; });
                              setCustomShares(newShares);
                            }}
                            className="text-xs text-indigo-500 hover:underline font-medium"
                          >
                            Repartir parejo
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (allSelected) {
                              setSelectedParticipants([]);
                            } else {
                              setSelectedParticipants(participants.map(p => p.id));
                            }
                          }}
                          className="text-xs text-indigo-500 hover:underline font-medium"
                        >
                          {allSelected ? 'Deseleccionar todos' : 'Todos'}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1 max-h-48 overflow-y-auto p-2 border border-[var(--border)] rounded-lg bg-[var(--bg-secondary)]">
                      {participants.length === 0 && <p className="text-xs text-[var(--text-muted)] text-center py-2">Agrega participantes primero</p>}
                      {participants.map(p => {
                        const isSelected = selectedParticipants.includes(p.id);
                        return (
                          <div key={p.id} className="flex items-center justify-between gap-2 p-1.5 hover:bg-[var(--bg-card)] rounded-md transition-colors">
                            <label className="flex items-center gap-2 text-sm cursor-pointer flex-1 min-w-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={e => {
                                  if (e.target.checked) {
                                    setSelectedParticipants([...selectedParticipants, p.id]);
                                  } else {
                                    setSelectedParticipants(selectedParticipants.filter(s => s !== p.id));
                                  }
                                }}
                                className="rounded text-indigo-500 focus:ring-indigo-500 w-3.5 h-3.5"
                              />
                              <span className="text-[var(--text-primary)] truncate text-xs sm:text-sm">{p.name}</span>
                            </label>

                            {/* Input inline para PERCENTAGE */}
                            {splitMode === 'PERCENTAGE' && isSelected && (
                              <div className="flex items-center gap-1 shrink-0">
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  max="100"
                                  placeholder="0"
                                  value={customShares[p.id] || ''}
                                  onChange={e => setCustomShares({ ...customShares, [p.id]: e.target.value })}
                                  className="w-16 px-1.5 py-1 text-xs border border-[var(--border)] rounded bg-[var(--bg-primary)] text-[var(--text-primary)] text-right outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                                <span className="text-xs text-[var(--text-muted)]">%</span>
                              </div>
                            )}

                            {/* Input inline para CUSTOM */}
                            {splitMode === 'CUSTOM' && isSelected && (
                              <div className="flex items-center gap-1 shrink-0">
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  placeholder="0.00"
                                  value={customShares[p.id] || ''}
                                  onChange={e => setCustomShares({ ...customShares, [p.id]: e.target.value })}
                                  className="w-20 px-1.5 py-1 text-xs border border-[var(--border)] rounded bg-[var(--bg-primary)] text-[var(--text-primary)] text-right outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                                <span className="text-[10px] text-[var(--text-muted)]">{currency}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Resumen de validación para porcentaje */}
                    {splitMode === 'PERCENTAGE' && selectedParticipants.length > 0 && (
                      <div className="flex justify-between items-center text-xs mt-1 px-1">
                        <span className="text-[var(--text-muted)]">Total asignado:</span>
                        {(() => {
                          const sumPct = selectedParticipants.reduce((acc, pId) => acc + (parseFloat(customShares[pId] || '0') || 0), 0);
                          const isOk = Math.abs(sumPct - 100) <= 0.1;
                          return (
                            <span className={`font-semibold ${isOk ? 'text-emerald-500' : 'text-amber-500'}`}>
                              {sumPct.toFixed(1)}% / 100%
                            </span>
                          );
                        })()}
                      </div>
                    )}

                    {/* Resumen de validación para custom amount */}
                    {splitMode === 'CUSTOM' && selectedParticipants.length > 0 && (
                      <div className="flex justify-between items-center text-xs mt-1 px-1">
                        <span className="text-[var(--text-muted)]">Total asignado:</span>
                        {(() => {
                          const sumCustom = selectedParticipants.reduce((acc, pId) => acc + (parseFloat(customShares[pId] || '0') || 0), 0);
                          const target = parseFloat(amount) || 0;
                          const isOk = target > 0 && Math.abs(sumCustom - target) <= 0.05;
                          return (
                            <span className={`font-semibold ${isOk ? 'text-emerald-500' : 'text-amber-500'}`}>
                              {sumCustom.toFixed(2)} / {target.toFixed(2)} {currency}
                            </span>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
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
                    const isPersonal = exp.split_mode === 'PERSONAL';
                    const isPct = exp.split_mode === 'PERCENTAGE';
                    const isCustom = exp.split_mode === 'CUSTOM';
                    return (
                      <div key={exp.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-3 rounded-lg border border-[var(--border)] hover:border-indigo-200 dark:hover:border-indigo-500/30 transition-colors gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-medium text-[var(--text-primary)] text-sm truncate">{exp.description}</p>
                            {isPersonal && (
                              <span className="text-[10px] bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded font-semibold">
                                Personal
                              </span>
                            )}
                            {isPct && (
                              <span className="text-[10px] bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded font-semibold">
                                % Porcentaje
                              </span>
                            )}
                            {isCustom && (
                              <span className="text-[10px] bg-teal-100 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 px-1.5 py-0.5 rounded font-semibold">
                                Manual
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                            {payer} {isPersonal ? 'pago por su cuenta' : 'pago'}{' '}
                            <span className="font-semibold text-[var(--text-primary)]">{formatOriginal(exp.amount, expCurrency)}</span>
                            {showUsdConversion && (
                              <span className="text-[var(--text-muted)]"> ({formatUSD(expUsd)})</span>
                            )}
                            {!isPersonal && ` — ${expSplits.length} pers.`}
                          </p>
                          {exp.notes && (
                            <p className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate italic">
                              {exp.notes}
                            </p>
                          )}
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
          <div className="space-y-5">
            {/* AVISO DE REGISTROS DE LIQUIDACIÓN HUÉRFANOS SI NO HAY GASTOS */}
            {expenses.length === 0 && settlementRecords.length > 0 && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-700 dark:text-amber-300 shadow-xs">
                <div className="flex items-center gap-2.5">
                  <AlertCircle size={18} className="shrink-0 text-amber-500" />
                  <div>
                    <p className="font-semibold text-sm">Registros de liquidación sin gastos activos</p>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">Se detectaron pagos o perdones de gastos que fueron eliminados. Puedes limpiarlos para que la sala quede en cero.</p>
                  </div>
                </div>
                <button
                  onClick={handleClearAllSettlements}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-medium shrink-0 transition-colors shadow-xs cursor-pointer"
                >
                  Reiniciar sala a cero
                </button>
              </div>
            )}

            {/* AVISOS DE PAGOS PENDIENTES DE CONFIRMACIÓN */}
            {settlementRecords.filter(s => s.status === 'PENDING').length > 0 && (
              <div className="space-y-2">
                {settlementRecords.filter(s => s.status === 'PENDING').map(st => {
                  const fromP = participants.find(p => p.id === st.from_id);
                  const toP = participants.find(p => p.id === st.to_id);
                  const isCreditor = user && toP?.user_id === user.id;
                  const isDebtor = user && fromP?.user_id === user.id;
                  const canConfirm = isCreditor || (!toP?.user_id && isOwner);

                  return (
                    <div key={st.id} className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-xs">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-500/20 text-amber-500 rounded-xl shrink-0">
                          <Clock size={18} />
                        </div>
                        <div>
                          <p className="text-xs sm:text-sm font-semibold text-[var(--text-primary)]">
                            Pago reportado por <span className="font-bold text-red-500">{fromP?.name || 'Deudor'}</span> a <span className="font-bold text-emerald-500">{toP?.name || 'Acreedor'}</span>
                          </p>
                          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                            Monto: <span className="font-bold text-[var(--text-primary)]">{formatUSD(st.amount_usd || st.amount)}</span>
                            {st.notes && ` — "${st.notes}"`}
                          </p>
                        </div>
                      </div>

                      {canConfirm ? (
                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                          <button
                            onClick={() => handleConfirmPayment(st.id)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                          >
                            <Check size={14} /> Confirmar cobrado
                          </button>
                          <button
                            onClick={() => handleRejectPayment(st.id)}
                            className="bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 text-xs font-medium px-3 py-2 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <X size={14} /> Rechazar
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs font-medium bg-amber-500/20 text-amber-700 dark:text-amber-300 px-3 py-1 rounded-full self-start sm:self-center">
                          {isDebtor ? 'Esperando confirmacion de tu pago' : `Pendiente de confirmacion por ${toP?.name || 'acreedor'}`}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-5">
              {/* TARJETA DE BALANCES */}
              <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 transition-colors shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-4 pb-3 border-b border-[var(--border)]">
                    <div>
                      <h2 className="text-base font-bold text-[var(--text-primary)]">Balances (USD)</h2>
                      <p className="text-xs text-[var(--text-muted)]">Consolidado en dolares</p>
                    </div>
                    {isBalanceZero ? (
                      <span className="text-[11px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-bold">
                        Cuadrado ($0.00)
                      </span>
                    ) : (
                      <span className="text-[11px] bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 px-2.5 py-0.5 rounded-full font-bold">
                        <AlertCircle size={11} className="inline mr-1" />Error: {balanceSum.toFixed(2)}
                      </span>
                    )}
                  </div>

                  <ul className="space-y-2.5">
                    {balances.map(b => {
                      const isMe = user && participants.find(p => p.id === b.participantId)?.user_id === user.id;
                      return (
                        <li key={b.participantId} className="flex justify-between items-center p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] transition-colors">
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            <div className="w-8 h-8 rounded-full bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border)] flex items-center justify-center font-bold text-xs shrink-0">
                              {getInitials(b.name)}
                            </div>
                            <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                              {b.name} {isMe && <span className="text-[10px] text-indigo-500 font-medium ml-1">(Tú)</span>}
                            </span>
                          </div>

                          <div className="shrink-0">
                            {Math.abs(b.balance) > 0.001 ? (
                              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                                b.balance > 0.001
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                              }`}>
                                {b.balance > 0.001 ? `+${formatUSD(b.balance)}` : `-${formatUSD(Math.abs(b.balance))}`}
                              </span>
                            ) : (
                              <span className="text-xs font-medium text-[var(--text-muted)] bg-[var(--bg-card)] border border-[var(--border)] px-2.5 py-0.5 rounded-full">
                                {formatUSD(0)}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                    {balances.length === 0 && <p className="text-sm text-[var(--text-muted)] text-center py-4">Sin datos de participantes</p>}
                  </ul>
                </div>

                <div className="mt-5 p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-xs text-[var(--text-secondary)] space-y-1">
                  <p className="font-semibold text-[var(--text-primary)]">Guia de balances</p>
                  <p><span className="text-emerald-500 font-bold">Verde (+)</span>: Le deben dinero al participante.</p>
                  <p><span className="text-rose-500 font-bold">Rojo (-)</span>: El participante debe dinero a otros.</p>
                </div>
              </div>

              {/* TARJETA DE TRANSFERENCIAS */}
              <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 transition-colors shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-4 pb-3 border-b border-[var(--border)]">
                    <div>
                      <h2 className="text-base font-bold text-[var(--text-primary)]">Transferencias</h2>
                      <p className="text-xs text-[var(--text-muted)]">Como saldar deudas</p>
                    </div>
                    {settlements.length > 0 && (
                      <button
                        onClick={shareToWhatsApp}
                        className="flex items-center gap-1.5 text-xs font-semibold bg-[#25D366]/15 text-[#25D366] hover:bg-[#25D366]/25 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
                      >
                        <MessageCircle size={14} /> Compartir
                      </button>
                    )}
                  </div>

                  {settlements.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-[var(--border)] rounded-2xl">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto mb-2">
                        <Check size={20} />
                      </div>
                      <p className="text-sm font-bold text-[var(--text-primary)]">Todos a mano</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">No hay deudas pendientes en esta sala</p>
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {settlements.map((t, i) => {
                        const debtorPart = participants.find(p => p.id === t.from_id);
                        const creditorPart = participants.find(p => p.id === t.to_id);
                        const isDebtor = user && debtorPart?.user_id === user.id;
                        const isCreditor = user && creditorPart?.user_id === user.id;

                        return (
                          <li key={i} className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] space-y-3">
                            {/* Visualización clara de la transferencia */}
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div className="w-7 h-7 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold text-xs flex items-center justify-center shrink-0">
                                  {getInitials(t.from)}
                                </div>
                                <span className="text-sm font-bold text-rose-600 dark:text-rose-400 truncate">
                                  {t.from}
                                </span>
                              </div>

                              <div className="flex flex-col items-center shrink-0">
                                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">debe</span>
                                <div className="flex items-center gap-1 bg-[var(--bg-card)] px-3 py-1 rounded-full border border-[var(--border)] shadow-2xs">
                                  <span className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">{formatUSD(t.amount)}</span>
                                  <ArrowRight size={13} className="text-[var(--text-muted)]" />
                                </div>
                              </div>

                              <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
                                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 truncate text-right">
                                  {t.to}
                                </span>
                                <div className="w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold text-xs flex items-center justify-center shrink-0">
                                  {getInitials(t.to)}
                                </div>
                              </div>
                            </div>

                            {/* Acciones de liquidación según rol */}
                            <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]/70 justify-between">
                              <span className="text-[11px] text-[var(--text-muted)] italic">
                                {isDebtor ? 'Tu deuda' : isCreditor ? 'Te deben' : 'Transferencia sugerida'}
                              </span>

                              <div className="flex items-center gap-2">
                                {isDebtor && (
                                  <button
                                    type="button"
                                    onClick={() => openSettleModal(t.from_id || '', t.to_id || '', t.amount, 'PAYMENT')}
                                    className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg transition-colors font-semibold flex items-center gap-1 shadow-xs cursor-pointer"
                                  >
                                    Reportar Pago
                                  </button>
                                )}

                                {isCreditor && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => openSettleModal(t.from_id || '', t.to_id || '', t.amount, 'PAYMENT')}
                                      className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition-colors font-semibold flex items-center gap-1 shadow-xs cursor-pointer"
                                      title="Registrar que ya recibiste este pago"
                                    >
                                      Registrar Cobro
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openSettleModal(t.from_id || '', t.to_id || '', t.amount, 'FORGIVEN')}
                                      className="text-xs bg-[var(--bg-card)] hover:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-3 py-1.5 rounded-lg transition-colors font-semibold flex items-center gap-1 cursor-pointer"
                                      title="Condonar/perdonar la deuda a este participante"
                                    >
                                      Perdonar
                                    </button>
                                  </>
                                )}

                                {!isDebtor && !isCreditor && isOwner && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => openSettleModal(t.from_id || '', t.to_id || '', t.amount, 'PAYMENT')}
                                      className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg transition-colors font-semibold flex items-center gap-1 shadow-xs cursor-pointer"
                                    >
                                      Registrar Pago
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openSettleModal(t.from_id || '', t.to_id || '', t.amount, 'FORGIVEN')}
                                      className="text-xs bg-[var(--bg-card)] hover:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-3 py-1.5 rounded-lg transition-colors font-semibold flex items-center gap-1 cursor-pointer"
                                      title="Perdonar deuda en nombre del acreedor"
                                    >
                                      Perdonar (Acreedor)
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* HISTORIAL DE DEUDAS CANCELADAS Y CONDONADAS CON OPCIÓN DE ELIMINAR/REVERTIR */}
            {settlementRecords.filter(s => s.status === 'CONFIRMED').length > 0 && (
              <div className="p-5 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl shadow-xs">
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">
                      Deudas canceladas / Pagos confirmados ({settlementRecords.filter(s => s.status === 'CONFIRMED').length})
                    </h3>
                    <p className="text-xs text-[var(--text-muted)]">Historial de transferencias saldadas</p>
                  </div>
                  <button
                    onClick={handleClearAllSettlements}
                    className="text-xs text-red-500 hover:underline font-medium"
                    title="Eliminar todas las liquidaciones"
                  >
                    Reiniciar todas
                  </button>
                </div>

                <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {settlementRecords.filter(s => s.status === 'CONFIRMED').map(st => {
                    const fromP = participants.find(p => p.id === st.from_id)?.name || 'Deudor';
                    const toP = participants.find(p => p.id === st.to_id)?.name || 'Acreedor';
                    const isForgiven = st.settlement_type === 'FORGIVEN';
                    return (
                      <li key={st.id} className="text-xs flex items-center justify-between p-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
                        <div className="min-w-0 pr-2">
                          <span className="font-semibold text-[var(--text-primary)]">{fromP}</span>
                          <span className="text-[var(--text-muted)] mx-1">{isForgiven ? 'recibio perdon de' : 'pago a'}</span>
                          <span className="font-semibold text-[var(--text-primary)]">{toP}</span>
                          {st.notes && <span className="text-[10px] text-[var(--text-muted)] ml-1.5 italic">({st.notes})</span>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-bold text-[var(--text-primary)]">{formatUSD(st.amount_usd || st.amount)}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isForgiven ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'}`}>
                            {isForgiven ? 'Perdonada' : 'Pagado'}
                          </span>
                          <button
                            onClick={() => handleDeleteSettlement(st.id)}
                            className="text-[var(--text-muted)] hover:text-red-500 p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                            title="Eliminar este registro de liquidacion"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* MODAL PARA PAGAR O PERDONAR DEUDA (MUERTE A LA DEUDA) */}
        {settleModalOpen && (() => {
          const debtorPart = participants.find(p => p.id === settleFromId);
          const creditorPart = participants.find(p => p.id === settleToId);
          const isDebtorInModal = user && debtorPart?.user_id === user.id;
          const isCreditorInModal = user && creditorPart?.user_id === user.id;

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-150">
              <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-md p-5 sm:p-6 shadow-xl space-y-4">
                <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
                  <h3 className="text-base font-semibold text-[var(--text-primary)]">
                    {settleType === 'PAYMENT'
                      ? (isDebtorInModal ? 'Reportar Pago de Deuda' : 'Registrar Pago')
                      : 'Perdonar Deuda (Condonacion)'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setSettleModalOpen(false)}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-lg"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleSaveSettlement} className="space-y-3">
                  <FormError message={settleError} />

                  <div className="text-xs p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] space-y-1">
                    <p className="text-[var(--text-secondary)]">
                      <span className="font-semibold text-red-500">Deudor:</span> {debtorPart?.name || 'Deudor'} {isDebtorInModal && '(Tu)'}
                    </p>
                    <p className="text-[var(--text-secondary)]">
                      <span className="font-semibold text-emerald-500">Acreedor:</span> {creditorPart?.name || 'Acreedor'} {isCreditorInModal && '(Tu)'}
                    </p>
                  </div>

                  {/* Tipo de operacion: El deudor NUNCA puede perdonar su propia deuda */}
                  {isDebtorInModal ? (
                    <div className="p-2.5 bg-indigo-50/60 dark:bg-indigo-500/10 rounded-lg border border-indigo-100 dark:border-indigo-500/20 text-xs">
                      <p className="font-semibold text-indigo-700 dark:text-indigo-300">Reporte de Pago</p>
                      <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                        Como deudor, reportas que realizaste el pago a {creditorPart?.name || 'tu acreedor'}. Se le solicitará confirmación para cancelar la deuda.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                        {isCreditorInModal ? 'Accion como acreedor' : 'Tipo de operacion'}
                      </label>
                      <div className="grid grid-cols-2 gap-1.5 p-1 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] text-xs font-medium">
                        <button
                          type="button"
                          onClick={() => setSettleType('PAYMENT')}
                          className={`py-1.5 px-2 rounded-md transition-colors text-center ${settleType === 'PAYMENT' ? 'bg-indigo-500 text-white shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                        >
                          {isCreditorInModal ? 'Registrar Cobro' : 'Registrar Pago'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSettleType('FORGIVEN')}
                          className={`py-1.5 px-2 rounded-md transition-colors text-center ${settleType === 'FORGIVEN' ? 'bg-amber-500 text-white shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                        >
                          Perdonar Deuda
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Monto y Moneda fija en USD */}
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      Monto ({settleType === 'PAYMENT' ? 'a pagar' : 'a perdonar'})
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={settleAmount}
                        onChange={e => setSettleAmount(e.target.value)}
                        placeholder="0.00"
                        className="flex-1 px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                      <div className="px-3 py-2 text-sm font-bold border border-[var(--border)] rounded-lg bg-[var(--bg-secondary)] text-[var(--text-primary)] flex items-center justify-center min-w-[75px]">
                        USD ($)
                      </div>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">
                      La liquidacion final se consolida y procesa en Dolares (USD).
                    </p>
                  </div>

                  {/* Notas opcionales */}
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Notas (opcional)</label>
                    <input
                      type="text"
                      value={settleNotes}
                      onChange={e => setSettleNotes(e.target.value)}
                      placeholder="Ej. Transferencia QR, efectivo"
                      className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="text-[11px] p-2.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 text-[var(--text-secondary)]">
                    {settleType === 'PAYMENT'
                      ? (isDebtorInModal
                          ? 'Al reportar, se enviara un aviso para que el acreedor confirme la recepcion del dinero.'
                          : 'Al guardar, el cobro se confirmara inmediatamente y la deuda quedara saldada.')
                      : 'Al perdonar, la deuda quedara condonada de inmediato y el balance de la sala se actualizara.'}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setSettleModalOpen(false)}
                      className="flex-1 py-2 px-4 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={settleLoading}
                      className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 ${settleType === 'PAYMENT' ? 'bg-indigo-500 hover:bg-indigo-600' : 'bg-amber-500 hover:bg-amber-600'}`}
                    >
                      {settleLoading
                        ? 'Guardando...'
                        : settleType === 'PAYMENT'
                          ? (isDebtorInModal ? 'Reportar Pago' : 'Confirmar Cobro')
                          : 'Confirmar Perdon'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
