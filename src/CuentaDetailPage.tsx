import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { calculateBalances, calculateSettlement } from './utils';
import type { Group, Participant, Expense, ExpenseSplit, SplitMode, Settlement, SettlementType } from './utils';
import {
  Trash2,
  Edit2,
  Users,
  Receipt,
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Check,
  X,
  Copy,
  CheckCheck,
  Plus,
  Share2,
  HeartHandshake,
  DollarSign,
  RotateCcw,
  ShieldCheck,
  Coins,
  UserMinus,
} from 'lucide-react';
import { Navbar, ConfirmModal, FormError, useConfirmModal } from './components';
import { useAuth } from './hooks/useAuth';
import {
  fetchRatesFromUSD,
  toUSD,
  formatOriginal,
  formatUSD,
  SUPPORTED_CURRENCIES,
  CURRENCY_SYMBOLS,
} from './hooks/useExchangeRates';
import type { RatesMap } from './hooks/useExchangeRates';

type GroupFull = Group & { join_code: string; owner_id: string };

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getAvatarColor(name: string): string {
  const colors = [
    'from-indigo-500 to-indigo-600',
    'from-emerald-500 to-emerald-600',
    'from-amber-500 to-amber-600',
    'from-rose-500 to-rose-600',
    'from-cyan-500 to-cyan-600',
    'from-purple-500 to-purple-600',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function CuentaDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  // Código de unión: últimos 6 caracteres
  const joinCode = slug ? slug.slice(-6).toUpperCase() : '';

  const [group, setGroup] = useState<GroupFull | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [splits, setSplits] = useState<ExpenseSplit[]>([]);
  const [settlementRecords, setSettlementRecords] = useState<Settlement[]>([]);
  const [copiedCode, setCopiedCode] = useState(false);

  // Tasas de cambio
  const [rates, setRates] = useState<RatesMap>({ USD: 1 });
  const ratesLoadedRef = useRef(false);

  // Navegación de pestañas
  const [activeTab, setActiveTab] = useState<'expenses' | 'settlement' | 'participants'>('expenses');

  // Modal de formulario de gastos
  const [isExpenseFormOpen, setIsExpenseFormOpen] = useState(false);
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

  // Participante nuevo
  const [newPartName, setNewPartName] = useState('');
  const [loading, setLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [expenseModalError, setExpenseModalError] = useState<string | null>(null);
  const [addPartError, setAddPartError] = useState<string | null>(null);

  const { modal, showConfirm, closeConfirm } = useConfirmModal();

  useEffect(() => {
    if (joinCode) fetchAll(joinCode);
  }, [joinCode]);

  async function fetchAll(code: string) {
    setLoading(true);
    try {
      if (!ratesLoadedRef.current) {
        ratesLoadedRef.current = true;
        const result = await fetchRatesFromUSD();
        setRates(result.rates);
      }

      const { data: found } = await supabase.rpc('find_group_by_code', { p_code: code });
      if (!found || found.length === 0) {
        navigate('/cuentas');
        return;
      }
      const groupId = found[0].id;

      const { data: gData } = await supabase.from('groups').select('*').eq('id', groupId).single();
      const { data: pData } = await supabase
        .from('participants')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: true });
      const { data: eData } = await supabase
        .from('expenses')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });
      const { data: sData } = await supabase.from('expense_splits').select('*');

      let stData: Settlement[] = [];
      try {
        const { data } = await supabase
          .from('settlements')
          .select('*')
          .eq('group_id', groupId)
          .order('created_at', { ascending: false });
        if (data) stData = data;
      } catch (e) {
        console.warn('Could not fetch settlements:', e);
      }

      if (!gData) {
        navigate('/cuentas');
        return;
      }
      setGroup(gData);
      setParticipants(pData || []);
      setExpenses(eData || []);
      setSplits(sData || []);
      setSettlementRecords(stData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleCopyCode() {
    if (!joinCode) return;
    navigator.clipboard.writeText(joinCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  function handleShareWhatsApp() {
    if (!group) return;
    const text = `Hola! Te invito a unirte a nuestra sala de gastos "${group.name}" en Cuentas Claras. Usa el codigo: ${group.join_code} o ingresa directamente.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }

  async function handleLeaveGroup() {
    if (!user || !group) return;
    const myParticipant = participants.find(p => p.user_id === user.id);
    if (myParticipant) {
      const balances = calculateBalances(participants, expenses, splits, settlementRecords);
      const myBal = balances.find(b => b.participantId === myParticipant.id);
      if (myBal && Math.abs(myBal.balance) > 0.01) {
        if (myBal.balance > 0) {
          setFormError(`No puedes salir: la sala te debe ${formatUSD(myBal.balance)}.`);
        } else {
          setFormError(`No puedes salir: tienes una deuda de ${formatUSD(Math.abs(myBal.balance))}.`);
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

  // --- GASTOS ---
  function resetExpenseForm() {
    setDescription('');
    setNotes('');
    setAmount('');
    setCurrency('BOB');
    setPayerId('');
    setSelectedParticipants([]);
    setSplitMode('EQUAL');
    setCustomShares({});
    setEditingExpenseId(null);
    setIsExpenseFormOpen(false);
    setFormError(null);
    setExpenseModalError(null);
  }

  function handleStartAddExpense() {
    resetExpenseForm();
    if (participants.length > 0) {
      setSelectedParticipants(participants.map(p => p.id));
      const myPart = participants.find(p => p.user_id === user?.id);
      if (myPart) setPayerId(myPart.id);
      else setPayerId(participants[0].id);
    }
    setExpenseModalError(null);
    setIsExpenseFormOpen(true);
  }

  function handleEditExpense(expense: Expense) {
    setDescription(expense.description);
    setNotes(expense.notes || '');
    setAmount(expense.amount.toString());
    setCurrency(expense.currency || 'BOB');
    setPayerId(expense.payer_id);
    setSplitMode(expense.split_mode || 'EQUAL');
    setEditingExpenseId(expense.id);

    const expenseSplits = splits.filter(s => s.expense_id === expense.id);
    setSelectedParticipants(expenseSplits.map(s => s.participant_id));

    const shares: Record<string, string> = {};
    expenseSplits.forEach(s => {
      if (s.share_value != null) {
        shares[s.participant_id] = s.share_value.toString();
      }
    });
    setCustomShares(shares);
    setFormError(null);
    setExpenseModalError(null);
    setIsExpenseFormOpen(true);
  }

  async function handleSaveExpense(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setExpenseModalError(null);
    if (!description.trim()) {
      const msg = 'La descripción o concepto es obligatorio.';
      setExpenseModalError(msg);
      setFormError(msg);
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      const msg = 'Ingresa un monto válido mayor a 0.';
      setExpenseModalError(msg);
      setFormError(msg);
      return;
    }
    if (!payerId) {
      const msg = 'Selecciona quién pagó la cuenta.';
      setExpenseModalError(msg);
      setFormError(msg);
      return;
    }

    let activeParticipants = selectedParticipants;
    if (splitMode === 'PERSONAL') {
      activeParticipants = [payerId];
    } else {
      if (activeParticipants.length === 0) {
        const msg = 'Selecciona al menos un participante para dividir el gasto.';
        setExpenseModalError(msg);
        setFormError(msg);
        return;
      }
    }

    if (splitMode === 'PERCENTAGE') {
      const sumPct = activeParticipants.reduce(
        (acc, pId) => acc + (parseFloat(customShares[pId] || '0') || 0),
        0
      );
      if (Math.abs(sumPct - 100) > 0.1) {
        const diff = 100 - sumPct;
        const msg = `La suma de los porcentajes debe ser exactamente 100%. Actualmente suma ${sumPct.toFixed(1)}% (${diff > 0 ? `faltan ${diff.toFixed(1)}%` : `excede por +${Math.abs(diff).toFixed(1)}%`}).`;
        setExpenseModalError(msg);
        setFormError(msg);
        return;
      }
    }

    if (splitMode === 'CUSTOM') {
      const sumCustom = activeParticipants.reduce(
        (acc, pId) => acc + (parseFloat(customShares[pId] || '0') || 0),
        0
      );
      if (Math.abs(sumCustom - parsedAmount) > 0.05) {
        const diff = parsedAmount - sumCustom;
        const msg = `La suma de los montos individuales (${sumCustom.toFixed(2)} ${currency}) debe ser igual al total del gasto (${parsedAmount.toFixed(2)} ${currency}). ${diff > 0 ? `Faltan ${diff.toFixed(2)} ${currency}` : `Excede por +${Math.abs(diff).toFixed(2)} ${currency}`}.`;
        setExpenseModalError(msg);
        setFormError(msg);
        return;
      }
    }

    const computedAmountUsd = toUSD(parsedAmount, currency, rates);

    try {
      if (editingExpenseId) {
        // Actualizar gasto
        const { error: expError } = await supabase
          .from('expenses')
          .update({
            description: description.trim(),
            notes: notes.trim(),
            amount: parsedAmount,
            currency,
            amount_usd: computedAmountUsd,
            payer_id: payerId,
            split_mode: splitMode,
          })
          .eq('id', editingExpenseId);

        if (expError) throw expError;

        // Reemplazar splits
        await supabase.from('expense_splits').delete().eq('expense_id', editingExpenseId);

        const newSplits = activeParticipants.map(pId => ({
          expense_id: editingExpenseId,
          participant_id: pId,
          share_value:
            splitMode === 'PERCENTAGE' || splitMode === 'CUSTOM'
              ? parseFloat(customShares[pId] || '0')
              : null,
        }));

        const { data: insertedSplits, error: splitError } = await supabase
          .from('expense_splits')
          .insert(newSplits)
          .select();

        if (splitError) throw splitError;

        setExpenses(
          expenses.map(e =>
            e.id === editingExpenseId
              ? {
                  ...e,
                  description: description.trim(),
                  notes: notes.trim(),
                  amount: parsedAmount,
                  currency,
                  amount_usd: computedAmountUsd,
                  payer_id: payerId,
                  split_mode: splitMode,
                }
              : e
          )
        );

        setSplits([...splits.filter(s => s.expense_id !== editingExpenseId), ...(insertedSplits || [])]);
      } else {
        // Insertar nuevo gasto
        const { data: expData, error: expError } = await supabase
          .from('expenses')
          .insert([
            {
              group_id: group?.id,
              description: description.trim(),
              notes: notes.trim(),
              amount: parsedAmount,
              currency,
              amount_usd: computedAmountUsd,
              payer_id: payerId,
              split_mode: splitMode,
            },
          ])
          .select();

        if (expError) throw expError;
        const newExpense = expData[0];

        const newSplits = activeParticipants.map(pId => ({
          expense_id: newExpense.id,
          participant_id: pId,
          share_value:
            splitMode === 'PERCENTAGE' || splitMode === 'CUSTOM'
              ? parseFloat(customShares[pId] || '0')
              : null,
        }));

        const { data: insertedSplits, error: splitError } = await supabase
          .from('expense_splits')
          .insert(newSplits)
          .select();

        if (splitError) throw splitError;

        setExpenses([newExpense, ...expenses]);
        setSplits([...splits, ...(insertedSplits || [])]);
      }

      resetExpenseForm();
    } catch (err: any) {
      const msg = 'Error al guardar gasto: ' + (err.message || err);
      setExpenseModalError(msg);
      setFormError(msg);
    }
  }

  function handleDeleteExpense(expenseId: string) {
    showConfirm(
      'Eliminar Gasto',
      '¿Seguro que deseas eliminar este gasto? Los balances de los participantes se recalcularan.',
      async () => {
        try {
          await supabase.from('expense_splits').delete().eq('expense_id', expenseId);
          const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
          if (error) throw error;

          const updatedExpenses = expenses.filter(e => e.id !== expenseId);
          setExpenses(updatedExpenses);
          setSplits(splits.filter(s => s.expense_id !== expenseId));

          // Si ya no quedan gastos en la sala, limpiar liquidaciones huérfanas
          if (updatedExpenses.length === 0 && group?.id) {
            await supabase.from('settlements').delete().eq('group_id', group.id);
            setSettlementRecords([]);
          }
        } catch (err: any) {
          setFormError('Error al eliminar gasto: ' + (err.message || err));
        }
      }
    );
  }

  // --- LIQUIDACION Y MUERTE A LA DEUDA ---
  function openSettleModal(
    fromId: string,
    toId: string,
    defaultAmountUsd: number,
    type: SettlementType = 'PAYMENT'
  ) {
    setSettleFromId(fromId);
    setSettleToId(toId);
    setSettleAmount(defaultAmountUsd.toFixed(2));
    const isDebtor = user && participants.find(p => p.id === fromId)?.user_id === user.id;
    // Un deudor jamás puede abrir para perdonarse su propia deuda
    setSettleType(isDebtor ? 'PAYMENT' : type);
    setSettleNotes('');
    setSettleError(null);
    setSettleModalOpen(true);
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

    if (settleType === 'FORGIVEN') {
      if (isDebtor) {
        setSettleError('No puedes perdonar tu propia deuda. Solo el acreedor puede condonarla.');
        return;
      }
      if (debtorPart?.user_id && !isCreditor && group?.owner_id !== user?.id) {
        setSettleError('Solo el acreedor puede condonar esta deuda.');
        return;
      }
    }

    setSettleLoading(true);
    const usdAmount = parsed;

    // Si quien registra es el acreedor o el admin de la sala, queda CONFIRMED.
    // Si quien reporta es el deudor, queda PENDING para validación del acreedor.
    const initialStatus: 'PENDING' | 'CONFIRMED' =
      settleType === 'FORGIVEN' || isCreditor || (!debtorPart?.user_id && group?.owner_id === user?.id)
        ? 'CONFIRMED'
        : 'PENDING';

    try {
      const { data, error } = await supabase
        .from('settlements')
        .insert([
          {
            group_id: group?.id,
            from_id: settleFromId,
            to_id: settleToId,
            amount: parsed,
            currency: 'USD',
            amount_usd: usdAmount,
            settlement_type: settleType,
            status: initialStatus,
            notes: settleNotes.trim(),
          },
        ])
        .select();

      if (error) throw error;
      if (data && data[0]) {
        setSettlementRecords([data[0], ...settlementRecords]);
      }
      setSettleModalOpen(false);
    } catch (err: any) {
      setSettleError(err.message || 'Error al registrar la liquidacion.');
    } finally {
      setSettleLoading(false);
    }
  }

  async function handleConfirmPayment(settlementId: string) {
    try {
      const { error } = await supabase
        .from('settlements')
        .update({ status: 'CONFIRMED' })
        .eq('id', settlementId);
      if (error) throw error;

      setSettlementRecords(
        settlementRecords.map(s => (s.id === settlementId ? { ...s, status: 'CONFIRMED' } : s))
      );
    } catch (err: any) {
      setFormError('Error al confirmar pago: ' + (err.message || err));
    }
  }

  async function handleRejectPayment(settlementId: string) {
    showConfirm(
      'Rechazar Pago',
      '¿Confirmas que no recibiste este pago? Se eliminara la solicitud y la deuda permanecera abierta.',
      async () => {
        try {
          const { error } = await supabase.from('settlements').delete().eq('id', settlementId);
          if (error) throw error;
          setSettlementRecords(settlementRecords.filter(s => s.id !== settlementId));
        } catch (err: any) {
          setFormError('Error al rechazar pago: ' + (err.message || err));
        }
      }
    );
  }

  // Saldar todas las deudas pendientes de golpe (marca todo en 0.00)
  async function handleSettleAllDebts() {
    if (!group?.id || settlements.length === 0) return;
    showConfirm(
      'Saldar Todas las Deudas',
      '¿Deseas marcar como saldadas todas las deudas pendientes de esta sala? Todos los participantes quedaran en $0.00 inmediatamente.',
      async () => {
        try {
          const newSettlements = settlements.map(t => ({
            group_id: group.id,
            from_id: t.from_id,
            to_id: t.to_id,
            amount: t.amount,
            currency: 'USD',
            amount_usd: t.amount,
            settlement_type: 'PAYMENT' as SettlementType,
            status: 'CONFIRMED' as const,
            notes: 'Saldado total del grupo',
          }));

          const { data, error } = await supabase
            .from('settlements')
            .insert(newSettlements)
            .select();

          if (error) throw error;
          if (data) {
            setSettlementRecords([...data, ...settlementRecords]);
          }
        } catch (err: any) {
          setFormError('Error al saldar todas las deudas: ' + (err.message || err));
        }
      }
    );
  }

  // Deshacer una liquidación o condonación previa
  async function handleUndoSettlement(st: Settlement) {
    const fromP = participants.find(p => p.id === st.from_id)?.name || 'Deudor';
    const toP = participants.find(p => p.id === st.to_id)?.name || 'Acreedor';

    showConfirm(
      'Deshacer Liquidación',
      `¿Deseas anular este registro de ${formatUSD(st.amount_usd || st.amount)}? Al anularlo, se reabrira la deuda pendiente entre ${fromP} y ${toP}.`,
      async () => {
        try {
          const { error } = await supabase.from('settlements').delete().eq('id', st.id);
          if (error) throw error;
          setSettlementRecords(settlementRecords.filter(s => s.id !== st.id));
        } catch (err: any) {
          setFormError('Error al deshacer liquidacion: ' + (err.message || err));
        }
      }
    );
  }

  // Reiniciar sala desde cero (Peligro)
  async function handleResetRoomToZero() {
    if (!group?.id) return;
    showConfirm(
      'Reiniciar Sala a Cero',
      '¡Atención! Esta acción eliminara de forma definitiva TODOS los gastos y liquidaciones de esta sala. Todos los balances quedaran limpios en $0.00.',
      async () => {
        try {
          await supabase.from('settlements').delete().eq('group_id', group.id);
          const expIds = expenses.map(e => e.id);
          if (expIds.length > 0) {
            await supabase.from('expense_splits').delete().in('expense_id', expIds);
            await supabase.from('expenses').delete().eq('group_id', group.id);
          }
          setExpenses([]);
          setSplits([]);
          setSettlementRecords([]);
        } catch (err: any) {
          setFormError('Error al reiniciar sala: ' + (err.message || err));
        }
      }
    );
  }

  // --- PARTICIPANTES ---
  async function handleAddParticipant(e: React.FormEvent) {
    e.preventDefault();
    setAddPartError(null);
    if (!isOwner) {
      setAddPartError('Solo el organizador de la sala puede registrar invitados.');
      return;
    }
    if (!newPartName.trim()) {
      setAddPartError('Ingresa un nombre para el invitado.');
      return;
    }
    try {
      const { data, error } = await supabase
        .from('participants')
        .insert([{ group_id: group?.id, name: newPartName.trim() }])
        .select();

      if (error) throw error;
      setParticipants([...participants, data[0]]);
      setNewPartName('');
    } catch (err: any) {
      setAddPartError(err.message || 'Error al agregar participante.');
    }
  }

  async function handleExpelParticipant(part: Participant) {
    if (!isOwner) return;
    if (part.user_id === group?.owner_id) return;

    const bal = balances.find(b => b.participantId === part.id);
    const currentBalance = bal ? bal.balance : 0;
    const hasBalance = Math.abs(currentBalance) > 0.01;

    const hasPending = settlementRecords.some(
      s => s.status === 'PENDING' && (s.from_id === part.id || s.to_id === part.id)
    );

    if (hasBalance) {
      showConfirm(
        'Expulsión Bloqueada',
        `No es posible expulsar a ${part.name}: tiene un saldo pendiente de ${formatUSD(
          Math.abs(currentBalance)
        )} (${currentBalance > 0 ? 'se le debe dinero' : 'debe dinero'}). Todos los saldos deben estar en $0.00 antes de expulsar a un miembro.`,
        () => {},
        'Entendido'
      );
      return;
    }

    if (hasPending) {
      showConfirm(
        'Expulsión Bloqueada',
        `No es posible expulsar a ${part.name}: tiene transacciones de pago pendientes de confirmación. Primero confirma o rechaza esos pagos en la pestaña Liquidación.`,
        () => {},
        'Entendido'
      );
      return;
    }

    showConfirm(
      'Expulsar Participante',
      `¿Confirmas la expulsión de ${part.name} de la sala? Su balance está saldado ($0.00) y no tiene deudas pendientes.`,
      async () => {
        try {
          // 1. Si es usuario registrado, remover de group_members
          if (part.user_id && group?.id) {
            await supabase
              .from('group_members')
              .delete()
              .eq('group_id', group.id)
              .eq('user_id', part.user_id);
          }

          // 2. Intentar eliminar de participants
          const { error } = await supabase.from('participants').delete().eq('id', part.id);

          if (error) {
            // Si falla por clave foránea (por historial de gastos ya saldados)
            if (error.code === '23503' || error.message?.includes('foreign key')) {
              if (part.user_id) {
                await supabase
                  .from('participants')
                  .update({ user_id: null, name: `${part.name} (Expulsado)` })
                  .eq('id', part.id);
                setParticipants(
                  participants.map(p =>
                    p.id === part.id ? { ...p, user_id: null, name: `${part.name} (Expulsado)` } : p
                  )
                );
              } else {
                setAddPartError(
                  `No se puede eliminar completamente a ${part.name} porque figura en el historial de gastos pasados, pero su saldo permanece en $0.00.`
                );
                return;
              }
            } else {
              throw error;
            }
          } else {
            setParticipants(participants.filter(p => p.id !== part.id));
          }
        } catch (err: any) {
          setAddPartError('Error al expulsar participante: ' + (err.message || err));
        }
      },
      'Expulsar'
    );
  }

  // Cálculos reactivos
  const balances = calculateBalances(participants, expenses, splits, settlementRecords);
  const settlements = calculateSettlement(balances);

  // Total gastado en USD
  const totalUSD = expenses.reduce((sum, e) => {
    const usd = e.amount_usd > 0 ? e.amount_usd : toUSD(e.amount, e.currency || 'BOB', rates);
    return sum + usd;
  }, 0);

  // Balance del usuario actual
  const myParticipant = participants.find(p => p.user_id === user?.id);
  const myBalance = myParticipant ? balances.find(b => b.participantId === myParticipant.id) : null;

  // Notificaciones de pagos pendientes de confirmación para este usuario
  const pendingForMe = settlementRecords.filter(
    s => s.status === 'PENDING' && myParticipant && s.to_id === myParticipant.id
  );

  const isOwner = group?.owner_id === user?.id;
  const allSelected =
    participants.length > 0 && selectedParticipants.length === participants.length;

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] transition-colors pb-20">
        <Navbar backLabel="Mis salas" backTo="/cuentas" onSignOut={signOut} />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 animate-pulse">
          {/* Header skeleton */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 mb-6 shadow-xs">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[var(--border)] shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-48 bg-[var(--border)] rounded-lg" />
                <div className="h-3 w-32 bg-[var(--border)] rounded-lg" />
              </div>
              <div className="h-8 w-24 bg-[var(--border)] rounded-xl hidden sm:block" />
            </div>
          </div>
          {/* Stats cards skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-6">
            {[0, 1, 2].map(i => (
              <div key={i} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs space-y-2">
                <div className="h-3 w-24 bg-[var(--border)] rounded" />
                <div className="h-7 w-32 bg-[var(--border)] rounded-lg" />
                <div className="h-3 w-20 bg-[var(--border)] rounded" />
              </div>
            ))}
          </div>
          {/* Tab bar skeleton */}
          <div className="flex gap-1.5 p-1.5 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border)] mb-6">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex-1 h-10 bg-[var(--border)] rounded-xl" />
            ))}
          </div>
          {/* Expense rows skeleton */}
          <div className="space-y-2.5">
            {[0, 1, 2].map(i => (
              <div key={i} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[var(--border)] shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 bg-[var(--border)] rounded" />
                  <div className="h-3 w-28 bg-[var(--border)] rounded" />
                </div>
                <div className="h-5 w-20 bg-[var(--border)] rounded shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] transition-colors pb-20">
      <Navbar
        backLabel="Mis salas"
        backTo="/cuentas"
        userName={user?.user_metadata?.name || user?.email}
        onSignOut={signOut}
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 animate-fade-in">
        <FormError message={formError} />

        {/* HEADER DE LA SALA */}
        <section className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 mb-6 shadow-xs relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div
                className={`w-12 h-12 rounded-2xl bg-gradient-to-tr ${getAvatarColor(
                  group?.name || 'Sala'
                )} flex items-center justify-center text-white font-bold text-lg shadow-sm shrink-0`}
              >
                {getInitials(group?.name || 'Sala')}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight">
                    {group?.name}
                  </h1>
                  {isOwner && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                      Admin
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Creada el {new Date(group?.created_at || '').toLocaleDateString('es-ES', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
            </div>

            {/* ACCIONES DEL HEADER: CODIGO Y COMPARTIR */}
            <div className="flex items-center flex-wrap gap-2">
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-xs font-semibold text-[var(--text-primary)] hover:border-indigo-500/40 transition-all btn-press"
                title="Copiar codigo de sala"
              >
                <span className="text-[var(--text-muted)] font-mono">Codigo:</span>
                <span className="font-mono tracking-wider text-indigo-500">{joinCode}</span>
                {copiedCode ? <CheckCheck size={14} className="text-emerald-500" /> : <Copy size={13} className="text-[var(--text-muted)]" />}
                {copiedCode && <span className="text-[11px] text-emerald-500 font-medium">¡Copiado!</span>}
              </button>

              <button
                onClick={handleShareWhatsApp}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors btn-press"
                title="Invitar por WhatsApp"
              >
                <Share2 size={13} />
                <span className="hidden sm:inline">Invitar</span>
              </button>

              <button
                onClick={handleLeaveGroup}
                className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors btn-press ml-auto sm:ml-0"
              >
                Salir
              </button>
            </div>
          </div>
        </section>

        {/* TOP STATS CARDS */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-6">
          {/* Card 1: Total Gastado */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4.5 shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)] font-medium mb-1">
              <span>Total Gastado (USD)</span>
              <Coins size={16} className="text-indigo-500" />
            </div>
            <div className="text-2xl font-black text-[var(--text-primary)] tracking-tight">
              {formatUSD(totalUSD)}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              {expenses.length} {expenses.length === 1 ? 'gasto registrado' : 'gastos registrados'}
            </p>
          </div>

          {/* Card 2: Tu Posición Neta */}
          <div
            className={`border rounded-2xl p-4.5 shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md ${
              !myBalance || Math.abs(myBalance.balance) < 0.01
                ? 'bg-[var(--bg-card)] border-[var(--border)]'
                : myBalance.balance > 0
                ? 'bg-emerald-500/5 dark:bg-emerald-500/10 border-emerald-500/30'
                : 'bg-rose-500/5 dark:bg-rose-500/10 border-rose-500/30'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-medium mb-1">
              <span className="text-[var(--text-muted)]">Tu Balance Neto</span>
              {!myBalance || Math.abs(myBalance.balance) < 0.01 ? (
                <Check size={16} className="text-[var(--text-muted)]" />
              ) : myBalance.balance > 0 ? (
                <ArrowUpRight size={16} className="text-emerald-500" />
              ) : (
                <ArrowDownRight size={16} className="text-rose-500" />
              )}
            </div>
            <div
              className={`text-2xl font-black tracking-tight ${
                !myBalance || Math.abs(myBalance.balance) < 0.01
                  ? 'text-[var(--text-primary)]'
                  : myBalance.balance > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {!myBalance || Math.abs(myBalance.balance) < 0.01
                ? '$ 0.00'
                : myBalance.balance > 0
                ? `+ ${formatUSD(myBalance.balance)}`
                : `- ${formatUSD(Math.abs(myBalance.balance))}`}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-1 font-medium">
              {!myBalance || Math.abs(myBalance.balance) < 0.01
                ? 'Estás al día (sin deudas)'
                : myBalance.balance > 0
                ? 'Te deben en total'
                : 'Debes pagar en total'}
            </p>
          </div>

          {/* Card 3: Participantes */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4.5 shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)] font-medium mb-1">
              <span>Participantes</span>
              <Users size={16} className="text-amber-500" />
            </div>
            <div className="text-2xl font-black text-[var(--text-primary)] tracking-tight">
              {participants.length}
            </div>
            <div className="flex items-center gap-1 mt-1.5 overflow-hidden">
              {participants.slice(0, 5).map(p => (
                <div
                  key={p.id}
                  className={`w-5 h-5 rounded-full bg-gradient-to-tr ${getAvatarColor(
                    p.name
                  )} text-white text-[9px] font-bold flex items-center justify-center shrink-0`}
                  title={p.name}
                >
                  {getInitials(p.name)}
                </div>
              ))}
              {participants.length > 5 && (
                <span className="text-[10px] text-[var(--text-muted)] font-bold">
                  +{participants.length - 5}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* ALERTA: PAGOS REPORTADOS PENDIENTES DE CONFIRMACION */}
        {pendingForMe.length > 0 && (
          <section className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 animate-pulse-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-500 text-white shrink-0">
                <AlertCircle size={18} />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-amber-700 dark:text-amber-300">
                  {pendingForMe.length === 1
                    ? 'Tienes 1 pago reportado pendiente de confirmar'
                    : `Tienes ${pendingForMe.length} pagos reportados pendientes de confirmar`}
                </h4>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  Verifica tu cuenta y confirma para eliminar la deuda.
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('settlement')}
              className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs transition-colors self-end sm:self-auto shrink-0 shadow-xs btn-press"
            >
              Revisar en Liquidación
            </button>
          </section>
        )}

        {/* NAVEGACION POR PESTAÑAS (SEGMENTED TABS) */}
        <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border)] mb-6 overflow-x-auto">
          <button
            onClick={() => setActiveTab('expenses')}
            className={`flex-1 min-w-[120px] py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'expenses'
                ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xs border border-[var(--border)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Receipt size={16} />
            <span>Gastos</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)] font-black">
              {expenses.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('settlement')}
            className={`flex-1 min-w-[120px] py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all relative ${
              activeTab === 'settlement'
                ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xs border border-[var(--border)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <DollarSign size={16} />
            <span>Liquidación</span>
            {settlements.length > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 font-black">
                {settlements.length}
              </span>
            )}
            {pendingForMe.length > 0 && (
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping absolute top-2 right-3" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('participants')}
            className={`flex-1 min-w-[120px] py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'participants'
                ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xs border border-[var(--border)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Users size={16} />
            <span>Participantes</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)] font-black">
              {participants.length}
            </span>
          </button>
        </div>

        {/* ========================================================= */}
        {/* PESTAÑA 1: GASTOS                                        */}
        {/* ========================================================= */}
        {activeTab === 'expenses' && (
          <div className="space-y-6 animate-slide-up">
            {/* Header de la sección de gastos con botón nuevo gasto */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
                  Historial de Gastos
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Registra y gestiona los gastos compartidos
                </p>
              </div>

              <button
                onClick={handleStartAddExpense}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow-xs transition-all btn-press"
              >
                <Plus size={16} />
                <span>Nuevo Gasto</span>
              </button>
            </div>

            {/* LISTA DE GASTOS */}
            {expenses.length === 0 ? (
              <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-10 text-center shadow-xs">
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto mb-3">
                  <Receipt size={28} />
                </div>
                <h3 className="text-base font-bold text-[var(--text-primary)] mb-1">
                  No hay gastos registrados todavía
                </h3>
                <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto mb-5">
                  Registra el primer gasto de este viaje o evento para que el sistema comience a calcular balances.
                </p>
                <button
                  onClick={handleStartAddExpense}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-all btn-press inline-flex items-center gap-1.5"
                >
                  <Plus size={15} />
                  <span>Añadir Primer Gasto</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {expenses.map(expense => {
                  const payer = participants.find(p => p.id === expense.payer_id);
                  const isPersonal = expense.split_mode === 'PERSONAL';
                  const expUsd = expense.amount_usd > 0 ? expense.amount_usd : toUSD(expense.amount, expense.currency || 'BOB', rates);
                  const pct = totalUSD > 0 ? Math.min(100, (expUsd / totalUSD) * 100) : 0;
                  return (
                    <div
                      key={expense.id}
                      className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl shadow-xs hover:border-[var(--text-muted)] hover:shadow-md transition-all overflow-hidden"
                    >
                      {/* Content row */}
                      <div className="p-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] flex items-center justify-center text-indigo-500 shrink-0">
                            <Receipt size={18} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-[var(--text-primary)] truncate">
                                {expense.description}
                              </h4>
                              {isPersonal ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shrink-0">
                                  Personal
                                </span>
                              ) : expense.split_mode === 'PERCENTAGE' ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
                                  % Porcentaje
                                </span>
                              ) : expense.split_mode === 'CUSTOM' ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 shrink-0">
                                  Monto Fijo
                                </span>
                              ) : null}
                            </div>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5">
                              Pagado por <strong className="text-[var(--text-secondary)]">{payer?.name || 'Alguien'}</strong>
                              {expense.created_at ? ` • ${new Date(expense.created_at).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })}` : ''}
                              {expense.notes && <span className="italic ml-1">({expense.notes})</span>}
                            </p>
                          </div>
                        </div>

                        {/* Montos y acciones */}
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <div className="text-sm sm:text-base font-extrabold text-[var(--text-primary)]">
                              {formatOriginal(expense.amount, expense.currency || 'BOB')}
                            </div>
                            {expense.currency !== 'USD' && (
                              <div className="text-[11px] text-[var(--text-muted)] font-medium">
                                ≈ {formatUSD(expUsd)}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1 border-l border-[var(--border)] pl-2">
                            <button
                              onClick={() => handleEditExpense(expense)}
                              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                              title="Editar gasto"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              onClick={() => handleDeleteExpense(expense.id)}
                              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                              title="Eliminar gasto"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Barra de progreso: porcentaje del total */}
                      {totalUSD > 0 && (
                        <div className="px-4 pb-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-indigo-400/70 transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-bold text-[var(--text-muted)] shrink-0 w-9 text-right">
                              {pct.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* PESTAÑA 2: LIQUIDACIÓN (MUERTE A LA DEUDA)               */}
        {/* ========================================================= */}
        {activeTab === 'settlement' && (
          <div className="space-y-6 animate-slide-up">
            {/* SECCIÓN 1: TRANSFERENCIAS PENDIENTES */}
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-4 mb-5">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <HeartHandshake size={20} className="text-indigo-500" />
                    <span>Transferencias para saldar cuentas</span>
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Calculadas en Dólares (USD) con el número mínimo de transferencias
                  </p>
                </div>

                {settlements.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSettleAllDebts}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-all btn-press"
                      title="Marcar todas las deudas pendientes como saldadas"
                    >
                      Saldar todas las deudas
                    </button>
                    <button
                      onClick={handleShareWhatsApp}
                      className="px-3 py-1.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors btn-press flex items-center gap-1.5"
                    >
                      <Share2 size={13} />
                      <span className="hidden sm:inline">Compartir</span>
                    </button>
                  </div>
                )}
              </div>

              {settlements.length === 0 ? (
                <div className="py-10 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto mb-3">
                    <ShieldCheck size={32} />
                  </div>
                  <h4 className="text-base font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                    ¡Todos están al día!
                  </h4>
                  <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
                    No existen deudas pendientes en esta sala. Todos los participantes tienen balance en cero ($0.00).
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {settlements.map((t, idx) => {
                    const fromPart = participants.find(p => p.id === t.from_id);
                    const toPart = participants.find(p => p.id === t.to_id);
                    const isCreditor = user && toPart?.user_id === user.id;
                    const isDebtor = user && fromPart?.user_id === user.id;

                    return (
                      <div
                        key={idx}
                        className="p-4 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:border-[var(--text-muted)] hover:shadow-sm"
                      >
                        {/* Flujo Deudor -> Monto -> Acreedor */}
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Deudor */}
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-8 h-8 rounded-full bg-gradient-to-tr ${getAvatarColor(
                                t.from
                              )} text-white text-[10px] font-bold flex items-center justify-center shrink-0`}
                            >
                              {getInitials(t.from)}
                            </div>
                            <span className="text-xs sm:text-sm font-bold text-[var(--text-primary)] truncate max-w-[120px]">
                              {t.from}
                            </span>
                          </div>

                          {/* Píldora de Monto */}
                          <div className="flex flex-col items-center shrink-0 px-2">
                            <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">
                              Debe
                            </span>
                            <div className="flex items-center gap-1 font-extrabold text-sm text-[var(--text-primary)] bg-[var(--bg-card)] px-3 py-1 rounded-full border border-[var(--border)] shadow-xs">
                              <span>{formatUSD(t.amount)}</span>
                              <ArrowRight size={13} className="text-indigo-500" />
                            </div>
                          </div>

                          {/* Acreedor */}
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-8 h-8 rounded-full bg-gradient-to-tr ${getAvatarColor(
                                t.to
                              )} text-white text-[10px] font-bold flex items-center justify-center shrink-0`}
                            >
                              {getInitials(t.to)}
                            </div>
                            <span className="text-xs sm:text-sm font-bold text-[var(--text-primary)] truncate max-w-[120px]">
                              {t.to}
                            </span>
                          </div>
                        </div>

                        {/* Botones de acción según rol */}
                        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                          {isCreditor ? (
                            <>
                              <button
                                onClick={() => openSettleModal(t.from_id, t.to_id, t.amount, 'PAYMENT')}
                                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs btn-press"
                              >
                                Registrar Cobro
                              </button>
                              <button
                                onClick={() => openSettleModal(t.from_id, t.to_id, t.amount, 'FORGIVEN')}
                                className="px-3 py-1.5 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 text-xs font-bold transition-all btn-press"
                              >
                                Perdonar
                              </button>
                            </>
                          ) : isDebtor ? (
                            <button
                              onClick={() => openSettleModal(t.from_id, t.to_id, t.amount, 'PAYMENT')}
                              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-xs btn-press"
                            >
                              Reportar Pago
                            </button>
                          ) : isOwner ? (
                            <button
                              onClick={() => openSettleModal(t.from_id, t.to_id, t.amount, 'PAYMENT')}
                              className="px-3 py-1.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all btn-press"
                            >
                              Gestionar Pago
                            </button>
                          ) : (
                            <span className="text-[11px] text-[var(--text-muted)] italic">
                              Pendiente
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* SECCIÓN 2: PAGOS PENDIENTES DE VALIDACIÓN (SI LOS HAY) */}
            {settlementRecords.filter(s => s.status === 'PENDING').length > 0 && (
              <div className="bg-[var(--bg-card)] border border-amber-500/30 rounded-2xl p-5 shadow-xs">
                <h4 className="text-sm font-bold text-amber-700 dark:text-amber-300 mb-3 flex items-center gap-2">
                  <AlertCircle size={16} />
                  <span>Avisos de pago pendientes de confirmación</span>
                </h4>
                <div className="space-y-2.5">
                  {settlementRecords
                    .filter(s => s.status === 'PENDING')
                    .map(st => {
                      const fromP = participants.find(p => p.id === st.from_id)?.name || 'Deudor';
                      const toP = participants.find(p => p.id === st.to_id)?.name || 'Acreedor';
                      const isCreditor = user && participants.find(p => p.id === st.to_id)?.user_id === user.id;

                      return (
                        <div
                          key={st.id}
                          className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                        >
                          <div>
                            <span className="font-bold text-[var(--text-primary)]">{fromP}</span>
                            <span className="text-[var(--text-muted)] mx-1">reportó haber pagado</span>
                            <strong className="font-extrabold text-[var(--text-primary)]">
                              {formatUSD(st.amount_usd || st.amount)}
                            </strong>
                            <span className="text-[var(--text-muted)] mx-1">a</span>
                            <span className="font-bold text-[var(--text-primary)]">{toP}</span>
                            {st.notes && <span className="italic ml-1 text-[var(--text-muted)]">({st.notes})</span>}
                          </div>

                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                            {isCreditor || isOwner ? (
                              <>
                                <button
                                  onClick={() => handleConfirmPayment(st.id)}
                                  className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors btn-press"
                                >
                                  Confirmar cobro
                                </button>
                                <button
                                  onClick={() => handleRejectPayment(st.id)}
                                  className="px-2.5 py-1 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-500/20 font-semibold text-xs transition-colors btn-press"
                                >
                                  Rechazar
                                </button>
                              </>
                            ) : (
                              <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                                Esperando confirmación de {toP}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* SECCIÓN 3: BALANCES GENERALES EN USD */}
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 shadow-xs">
              <h3 className="text-base font-bold text-[var(--text-primary)] mb-1 flex items-center gap-2">
                <DollarSign size={18} className="text-emerald-500" />
                <span>Balances Individuales (USD)</span>
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mb-4">
                Posición neta de cada participante tras registrar gastos y pagos
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {balances.map(b => {
                  const part = participants.find(p => p.id === b.participantId);
                  const isZero = Math.abs(b.balance) < 0.01;
                  const isPositive = b.balance > 0.01;

                  return (
                    <div
                      key={b.participantId}
                      className="p-3.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${getAvatarColor(
                            b.name
                          )} text-white text-xs font-bold flex items-center justify-center shrink-0`}
                        >
                          {getInitials(b.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm font-bold text-[var(--text-primary)] truncate">
                            {b.name} {part?.user_id === user?.id ? '(Tú)' : ''}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)]">
                            {isZero ? 'Al día ($0.00)' : isPositive ? 'Le deben' : 'Debe'}
                          </div>
                        </div>
                      </div>

                      <div
                        className={`text-sm sm:text-base font-extrabold shrink-0 ${
                          isZero
                            ? 'text-[var(--text-muted)]'
                            : isPositive
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isZero ? '$ 0.00' : isPositive ? `+ ${formatUSD(b.balance)}` : `- ${formatUSD(Math.abs(b.balance))}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SECCIÓN 4: HISTORIAL DE LIQUIDACIONES CONFIRMADAS */}
            {settlementRecords.filter(s => s.status === 'CONFIRMED').length > 0 && (
              <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 shadow-xs">
                <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)] mb-1">
                  Historial de Pagos y Condonaciones
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mb-4">
                  Registro de auditoría de transferencias realizadas o deudas perdonadas
                </p>

                <div className="space-y-2">
                  {settlementRecords
                    .filter(s => s.status === 'CONFIRMED')
                    .map(st => {
                      const fromP = participants.find(p => p.id === st.from_id)?.name || 'Deudor';
                      const toP = participants.find(p => p.id === st.to_id)?.name || 'Acreedor';
                      const isForgiven = st.settlement_type === 'FORGIVEN';

                      return (
                        <div
                          key={st.id}
                          className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0 pr-2">
                            <span className="font-bold text-[var(--text-primary)]">{fromP}</span>
                            <span className="text-[var(--text-muted)] mx-1">
                              {isForgiven ? 'recibió condonación de' : 'pagó a'}
                            </span>
                            <span className="font-bold text-[var(--text-primary)]">{toP}</span>
                            {st.notes && (
                              <span className="text-[10px] text-[var(--text-muted)] italic ml-1">
                                ({st.notes})
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0">
                            <span className="font-extrabold text-[var(--text-primary)]">
                              {formatUSD(st.amount_usd || st.amount)}
                            </span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                isForgiven
                                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                  : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              }`}
                            >
                              {isForgiven ? 'Perdonada' : 'Pagado'}
                            </span>
                            <button
                              onClick={() => handleUndoSettlement(st)}
                              className="p-1 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors btn-press"
                              title="Deshacer este registro (reabrir deuda)"
                            >
                              <RotateCcw size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* SECCIÓN 5: ZONA DE REINICIO DE SALA (ADMINISTRACIÓN) */}
            {isOwner && (
              <div className="p-4 rounded-2xl bg-red-500/5 border border-red-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-red-600 dark:text-red-400">
                    Reiniciar sala desde cero
                  </h4>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    Elimina todos los gastos y liquidaciones si deseas comenzar un nuevo viaje limpio.
                  </p>
                </div>
                <button
                  onClick={handleResetRoomToZero}
                  className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors self-end sm:self-auto shrink-0 shadow-xs btn-press"
                >
                  Reiniciar Sala a Cero
                </button>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* PESTAÑA 3: PARTICIPANTES                                  */}
        {/* ========================================================= */}
        {activeTab === 'participants' && (
          <div className="space-y-6 animate-slide-up">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
                  Miembros de la Sala
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Personas que participan en la división de cuentas
                </p>
              </div>

              {/* Solo el admin (organizador) puede registrar participantes invitados */}
              {isOwner ? (
                <form onSubmit={handleAddParticipant} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newPartName}
                    onChange={e => setNewPartName(e.target.value)}
                    placeholder="Nombre de invitado..."
                    className="px-3.5 py-2 text-xs rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-[var(--text-muted)]"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-all btn-press flex items-center gap-1 shrink-0"
                  >
                    <Plus size={14} />
                    <span>Agregar Invitado</span>
                  </button>
                </form>
              ) : (
                <div className="text-xs text-[var(--text-muted)] bg-[var(--bg-secondary)] border border-[var(--border)] px-3 py-1.5 rounded-xl font-medium">
                  Solo el organizador puede agregar invitados
                </div>
              )}
            </div>

            {addPartError && <FormError message={addPartError} />}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {participants.map(part => {
                const bal = balances.find(b => b.participantId === part.id);
                const isZero = !bal || Math.abs(bal.balance) < 0.01;
                const isPositive = bal && bal.balance > 0.01;
                const isMemberOwner = part.user_id === group?.owner_id;
                const hasPending = settlementRecords.some(
                  s => s.status === 'PENDING' && (s.from_id === part.id || s.to_id === part.id)
                );
                const hasDebt = !isZero || hasPending;

                return (
                  <div
                    key={part.id}
                    className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs hover:border-[var(--text-muted)] hover:shadow-sm transition-all flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-2xl bg-gradient-to-tr ${getAvatarColor(
                            part.name
                          )} text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs`}
                        >
                          {getInitials(part.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-sm font-bold text-[var(--text-primary)] truncate">
                              {part.name}
                            </h4>
                            {part.user_id === user?.id && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-500 font-bold">
                                Tú
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                            {isMemberOwner ? 'Organizador' : part.user_id ? 'Usuario Registrado' : 'Invitado'}
                          </p>
                        </div>
                      </div>

                      {/* Botón expulsar exclusivo para el Admin y solo si no hay deudas */}
                      {isOwner && !isMemberOwner && (
                        <button
                          type="button"
                          onClick={() => handleExpelParticipant(part)}
                          title={
                            hasDebt
                              ? 'No se puede expulsar: tiene saldo o pagos pendientes'
                              : `Expulsar a ${part.name}`
                          }
                          className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all shrink-0 ${
                            hasDebt
                              ? 'bg-[var(--bg-secondary)] text-[var(--text-muted)] opacity-60 hover:opacity-100 cursor-pointer'
                              : 'bg-rose-500/10 hover:bg-rose-600 hover:text-white text-rose-600 dark:text-rose-400 btn-press'
                          }`}
                        >
                          <UserMinus size={13} />
                          <span className="text-[11px] font-bold">
                            {hasDebt ? 'Con Deuda' : 'Expulsar'}
                          </span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[var(--border)] text-xs">
                      <span className="text-[var(--text-muted)] font-medium">Balance neto:</span>
                      <span
                        className={`font-extrabold ${
                          isZero
                            ? 'text-[var(--text-muted)]'
                            : isPositive
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isZero ? '$ 0.00' : isPositive ? `+ ${formatUSD(bal.balance)}` : `- ${formatUSD(Math.abs(bal.balance))}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL PARA REGISTRAR O EDITAR GASTO                      */}
        {/* ========================================================= */}
        {isExpenseFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs transition-opacity animate-fade-in">
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl space-y-4 animate-scale-in">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 sticky top-0 bg-[var(--bg-card)] z-10">
                <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Receipt size={20} className="text-indigo-500" />
                  <span>{editingExpenseId ? 'Editar Gasto' : 'Registrar Nuevo Gasto'}</span>
                </h3>
                <button
                  type="button"
                  onClick={resetExpenseForm}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveExpense} className="space-y-4">
                {expenseModalError && <FormError message={expenseModalError} />}

                {/* BLOQUE 1: MONTO Y MONEDA */}
                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">
                    ¿Cuánto se pagó?
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 relative">
                      <input
                        type="number"
                        step="any"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-4 py-2.5 text-lg font-bold rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                        required
                        autoFocus
                      />
                    </div>
                    <div>
                      <select
                        value={currency}
                        onChange={e => setCurrency(e.target.value)}
                        className="w-full px-3 py-3 text-sm font-bold rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      >
                        {SUPPORTED_CURRENCIES.map(c => (
                          <option key={c} value={c}>
                            {c} ({CURRENCY_SYMBOLS[c]})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {amount && parseFloat(amount) > 0 && currency !== 'USD' && (
                    <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
                      Equivalente: ≈ <strong className="text-[var(--text-primary)]">{formatUSD(toUSD(parseFloat(amount), currency, rates))}</strong> (Tasa: {rates[currency]?.toFixed(2)} {currency}/USD)
                    </p>
                  )}
                </div>

                {/* BLOQUE 2: CONCEPTO Y NOTAS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">
                      Descripción / Concepto
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="Ej. Cena, Supermercado..."
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-indigo-500 outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">
                      Notas adicionales (opcional)
                    </label>
                    <input
                      type="text"
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Factura, detalles..."
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>

                {/* BLOQUE 3: QUIÉN PAGÓ */}
                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">
                    ¿Quién pagó la cuenta?
                  </label>
                  <select
                    value={payerId}
                    onChange={e => setPayerId(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm font-semibold rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-indigo-500 outline-none"
                    required
                  >
                    <option value="">Selecciona al pagador...</option>
                    {participants.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.user_id === user?.id ? '(Tú)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* BLOQUE 4: MODO DE DIVISION */}
                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">
                    ¿Cómo se divide?
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { mode: 'EQUAL', label: 'Partes Iguales', desc: 'Centavo exacto' },
                      { mode: 'PERCENTAGE', label: 'Porcentajes %', desc: 'Suma 100%' },
                      { mode: 'CUSTOM', label: 'Monto Fijo', desc: 'Monto exacto' },
                      { mode: 'PERSONAL', label: 'Gasto Personal', desc: 'Por su cuenta' },
                    ].map(item => (
                      <button
                        key={item.mode}
                        type="button"
                        onClick={() => setSplitMode(item.mode as SplitMode)}
                        className={`p-2.5 rounded-xl border text-left transition-all btn-press ${
                          splitMode === item.mode
                            ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shadow-xs'
                            : 'border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
                        }`}
                      >
                        <div className="font-bold text-xs">{item.label}</div>
                        <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{item.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* BLOQUE 5: SELECCION DE PARTICIPANTES O VALORES */}
                {splitMode !== 'PERSONAL' && (() => {
                  const parsedAmt = parseFloat(amount) || 0;
                  const sumPct = selectedParticipants.reduce(
                    (acc, pId) => acc + (parseFloat(customShares[pId] || '0') || 0),
                    0
                  );
                  const sumCustom = selectedParticipants.reduce(
                    (acc, pId) => acc + (parseFloat(customShares[pId] || '0') || 0),
                    0
                  );

                  return (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-bold text-[var(--text-secondary)]">
                          Participantes incluidos ({selectedParticipants.length}/{participants.length})
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            if (allSelected) setSelectedParticipants([]);
                            else setSelectedParticipants(participants.map(p => p.id));
                          }}
                          className="text-xs text-indigo-500 hover:underline font-semibold"
                        >
                          {allSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
                        </button>
                      </div>

                      {/* BANNER DINÁMICO EN MODO EQUITATIVO */}
                      {splitMode === 'EQUAL' && selectedParticipants.length > 0 && parsedAmt > 0 && (
                        <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 mb-3 flex items-center justify-between text-xs">
                          <span className="text-[var(--text-secondary)] font-medium">Cada uno paga equitativamente:</span>
                          <span className="font-extrabold text-indigo-600 dark:text-indigo-400 text-sm">
                            {formatOriginal(parsedAmt / selectedParticipants.length, currency)}
                            {currency !== 'USD' && (
                              <span className="text-[10px] text-[var(--text-muted)] font-normal ml-1">
                                (≈ {formatUSD(toUSD(parsedAmt / selectedParticipants.length, currency, rates))})
                              </span>
                            )}
                          </span>
                        </div>
                      )}

                      {/* BANNER DINÁMICO EN MODO PORCENTAJE */}
                      {splitMode === 'PERCENTAGE' && selectedParticipants.length > 0 && (
                        <div
                          className={`p-3 rounded-xl border mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs ${
                            Math.abs(sumPct - 100) < 0.1
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                              : sumPct > 100
                              ? 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300'
                              : 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold">Suma de Porcentajes:</span>
                              <span className="font-black text-sm">{sumPct.toFixed(1)}% / 100%</span>
                              {Math.abs(sumPct - 100) < 0.1 ? (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                                  Completo (100%)
                                </span>
                              ) : sumPct > 100 ? (
                                <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-bold">
                                  Excede por +{(sumPct - 100).toFixed(1)}%
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-amber-600 text-white text-[10px] font-bold">
                                  Falta {(100 - sumPct).toFixed(1)}%
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                              {parsedAmt > 0
                                ? `Distribuido: ${formatOriginal((parsedAmt * sumPct) / 100, currency)} de ${formatOriginal(parsedAmt, currency)}`
                                : 'Ingresa el porcentaje (%) que le corresponde a cada miembro.'}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              if (selectedParticipants.length === 0) return;
                              const count = selectedParticipants.length;
                              const basePct = Math.floor((100 / count) * 10) / 10;
                              const remainderUnits = Math.round((100 - basePct * count) * 10);
                              const sortedP = [...selectedParticipants].sort((a, b) => {
                                const balA = balances.find(bl => bl.participantId === a)?.balance ?? 0;
                                const balB = balances.find(bl => bl.participantId === b)?.balance ?? 0;
                                if (balA !== balB) return balA - balB; // Más deudor primero
                                return Math.random() - 0.5; // Desempate aleatorio justo
                              });
                              const winnerSet = new Set(sortedP.slice(0, remainderUnits));
                              const newShares: Record<string, string> = {};
                              selectedParticipants.forEach(pId => {
                                const extra = winnerSet.has(pId) ? 0.1 : 0;
                                newShares[pId] = (basePct + extra).toFixed(1);
                              });
                              setCustomShares(newShares);
                              setExpenseModalError(null);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-[11px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-indigo-500 transition-all shadow-xs btn-press shrink-0 self-start sm:self-auto"
                          >
                            Repartir 100% equitativo
                          </button>
                        </div>
                      )}

                      {/* BANNER DINÁMICO EN MODO MONTO FIJO */}
                      {splitMode === 'CUSTOM' && selectedParticipants.length > 0 && (
                        <div
                          className={`p-3 rounded-xl border mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs ${
                            Math.abs(sumCustom - parsedAmt) < 0.02
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                              : sumCustom > parsedAmt
                              ? 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300'
                              : 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold">Total Asignado:</span>
                              <span className="font-black text-sm">
                                {sumCustom.toFixed(2)} / {parsedAmt.toFixed(2)} {currency}
                              </span>
                              {Math.abs(sumCustom - parsedAmt) < 0.02 ? (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                                  Cubierto Exacto
                                </span>
                              ) : sumCustom > parsedAmt ? (
                                <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-bold">
                                  Excede por +{(sumCustom - parsedAmt).toFixed(2)} {currency}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-amber-600 text-white text-[10px] font-bold">
                                  Faltan {(parsedAmt - sumCustom).toFixed(2)} {currency}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                              Asigna el monto exacto asignado a cada participante.
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              if (selectedParticipants.length === 0 || parsedAmt <= 0) return;
                              const count = selectedParticipants.length;
                              const totalCents = Math.round(parsedAmt * 100);
                              const baseCents = Math.floor(totalCents / count);
                              const remainderCents = totalCents - baseCents * count;
                              const sortedP = [...selectedParticipants].sort((a, b) => {
                                const balA = balances.find(bl => bl.participantId === a)?.balance ?? 0;
                                const balB = balances.find(bl => bl.participantId === b)?.balance ?? 0;
                                if (balA !== balB) return balA - balB; // Más deudor primero
                                return Math.random() - 0.5; // Desempate aleatorio justo
                              });
                              const winnerSet = new Set(sortedP.slice(0, remainderCents));
                              const newShares: Record<string, string> = {};
                              selectedParticipants.forEach(pId => {
                                const cents = baseCents + (winnerSet.has(pId) ? 1 : 0);
                                newShares[pId] = (cents / 100).toFixed(2);
                              });
                              setCustomShares(newShares);
                              setExpenseModalError(null);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-[11px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-indigo-500 transition-all shadow-xs btn-press shrink-0 self-start sm:self-auto"
                          >
                            Distribuir saldo exacto
                          </button>
                        </div>
                      )}

                      {/* LISTADO DE PARTICIPANTES CON INPUTS Y EQUIVALENCIAS EN VIVO */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                        {participants.map(p => {
                          const isSelected = selectedParticipants.includes(p.id);
                          const pctVal = parseFloat(customShares[p.id] || '0') || 0;
                          const equivMoney = parsedAmt > 0 ? (parsedAmt * pctVal) / 100 : 0;
                          const customVal = parseFloat(customShares[p.id] || '0') || 0;
                          const equivPct = parsedAmt > 0 ? (customVal / parsedAmt) * 100 : 0;

                          return (
                            <div
                              key={p.id}
                              className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
                                isSelected
                                  ? 'bg-[var(--bg-secondary)] border-indigo-500/40'
                                  : 'bg-[var(--bg-primary)] border-[var(--border)] opacity-60'
                              }`}
                            >
                              <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={e => {
                                    if (e.target.checked) {
                                      setSelectedParticipants([...selectedParticipants, p.id]);
                                    } else {
                                      setSelectedParticipants(selectedParticipants.filter(id => id !== p.id));
                                    }
                                  }}
                                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                                />
                                <div
                                  className={`w-6 h-6 rounded-full bg-gradient-to-tr ${getAvatarColor(
                                    p.name
                                  )} text-white text-[10px] font-bold flex items-center justify-center shrink-0`}
                                >
                                  {getInitials(p.name)}
                                </div>
                                <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                                  {p.name} {p.id === payerId ? '(Pagador)' : ''}
                                </span>
                              </label>

                              {isSelected && splitMode === 'PERCENTAGE' && (
                                <div className="flex flex-col items-end shrink-0 ml-2">
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      step="any"
                                      value={customShares[p.id] || ''}
                                      onChange={e => {
                                        setCustomShares({ ...customShares, [p.id]: e.target.value });
                                        if (expenseModalError) setExpenseModalError(null);
                                      }}
                                      placeholder="0"
                                      className="w-16 px-2 py-1 text-xs font-bold rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-right text-[var(--text-primary)] focus:ring-2 focus:ring-indigo-500 outline-none"
                                    />
                                    <span className="text-xs font-bold text-[var(--text-muted)]">%</span>
                                  </div>
                                  <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                                    ≈ {formatOriginal(equivMoney, currency)}
                                  </span>
                                </div>
                              )}

                              {isSelected && splitMode === 'CUSTOM' && (
                                <div className="flex flex-col items-end shrink-0 ml-2">
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      step="any"
                                      value={customShares[p.id] || ''}
                                      onChange={e => {
                                        setCustomShares({ ...customShares, [p.id]: e.target.value });
                                        if (expenseModalError) setExpenseModalError(null);
                                      }}
                                      placeholder="0.00"
                                      className="w-20 px-2 py-1 text-xs font-bold rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-right text-[var(--text-primary)] focus:ring-2 focus:ring-indigo-500 outline-none"
                                    />
                                    <span className="text-[11px] font-mono text-[var(--text-muted)]">{currency}</span>
                                  </div>
                                  <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                                    ≈ {equivPct.toFixed(1)}%
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* MENSAJE DE ERROR DENTRO DEL MODAL */}
                {expenseModalError && <FormError message={expenseModalError} />}

                {/* BOTONES DE ACCION */}
                <div className="flex justify-end gap-2.5 pt-3 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={resetExpenseForm}
                    className="px-4 py-2 text-xs sm:text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl border border-[var(--border)] transition-colors btn-press"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs transition-all btn-press"
                  >
                    {editingExpenseId ? 'Guardar Cambios' : 'Añadir Gasto'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL PARA LIQUIDAR O PERDONAR DEUDA                      */}
        {/* ========================================================= */}
        {settleModalOpen && (() => {
          const debtorPart = participants.find(p => p.id === settleFromId);
          const isDebtorInModal = user && debtorPart?.user_id === user.id;

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs transition-opacity animate-fade-in">
              <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-md p-5 sm:p-6 shadow-2xl space-y-4 animate-scale-in">
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                  <h3 className="text-base font-bold text-[var(--text-primary)]">
                    {settleType === 'FORGIVEN' ? 'Perdonar Deuda' : isDebtorInModal ? 'Reportar Pago' : 'Registrar Cobro'}
                  </h3>
                  <button
                    onClick={() => setSettleModalOpen(false)}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-lg transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleSaveSettlement} className="space-y-4">
                  {/* Selector de tipo solo si NO es el deudor */}
                  {!isDebtorInModal && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSettleType('PAYMENT')}
                        className={`py-2 rounded-xl text-xs font-bold border transition-colors btn-press ${
                          settleType === 'PAYMENT'
                            ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                            : 'border-[var(--border)] text-[var(--text-secondary)]'
                        }`}
                      >
                        Cobrado en Mano
                      </button>
                      <button
                        type="button"
                        onClick={() => setSettleType('FORGIVEN')}
                        className={`py-2 rounded-xl text-xs font-bold border transition-colors btn-press ${
                          settleType === 'FORGIVEN'
                            ? 'bg-amber-500/10 border-amber-500 text-amber-700 dark:text-amber-300'
                            : 'border-[var(--border)] text-[var(--text-secondary)]'
                        }`}
                      >
                        Perdonar Deuda
                      </button>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">
                      Monto a liquidar (USD)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-[var(--text-muted)]">
                        $
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        value={settleAmount}
                        onChange={e => setSettleAmount(e.target.value)}
                        className="w-full pl-8 pr-4 py-2.5 text-base font-bold rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-indigo-500 outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">
                      Notas o referencia (opcional)
                    </label>
                    <input
                      type="text"
                      value={settleNotes}
                      onChange={e => setSettleNotes(e.target.value)}
                      placeholder="Ej. Transferencia QR, efectivo..."
                      className="w-full px-3.5 py-2 text-xs rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  {settleError && <FormError message={settleError} />}

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setSettleModalOpen(false)}
                      className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl border border-[var(--border)] transition-colors btn-press"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={settleLoading}
                      className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs transition-all btn-press disabled:opacity-50"
                    >
                      {settleLoading ? 'Procesando...' : settleType === 'FORGIVEN' ? 'Confirmar Perdón' : 'Confirmar'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          );
        })()}

        {/* MODAL DE CONFIRMACIÓN GENERAL */}
        <ConfirmModal
          isOpen={modal.isOpen}
          title={modal.title}
          message={modal.message}
          confirmLabel={modal.confirmLabel}
          onConfirm={modal.onConfirm}
          onCancel={closeConfirm}
        />
      </main>
    </div>
  );
}
