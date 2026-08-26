import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { calculateBalances, calculateSettlement } from './utils';
import type { Group, Participant, Expense, ExpenseSplit, Balance, Transfer } from './utils';
import { Trash2, Edit2, Plus, Users, Receipt, Calculator, AlertCircle, ArrowLeft, FolderOpen, X } from 'lucide-react';
import LandingPage from './LandingPage';

function App() {
  // Landing page state
  const [showLanding, setShowLanding] = useState(true);
  
  // Global state
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  
  // Group specific state
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [splits, setSplits] = useState<ExpenseSplit[]>([]);
  
  // Forms state
  const [newGroupName, setNewGroupName] = useState('');
  const [newParticipantName, setNewParticipantName] = useState('');
  
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [payerId, setPayerId] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  
  // UI state
  const [loading, setLoading] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'participants' | 'expenses' | 'balances'>('expenses');
  
  // Custom Confirm Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Load groups on mount
  useEffect(() => {
    fetchGroups();
  }, []);

  // Load group details when selected
  useEffect(() => {
    if (selectedGroup) {
      fetchGroupDetails(selectedGroup.id);
      setActiveTab('participants'); // Default tab when opening a group
      setFormError(null);
    }
  }, [selectedGroup]);

  // Clear form error when changing tabs
  useEffect(() => {
    setFormError(null);
  }, [activeTab]);

  async function fetchGroups() {
    setLoading(true);
    setGlobalError(null);
    try {
      if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
         setGlobalError('Faltan variables de entorno de Supabase. Configura .env.local');
         setLoading(false);
         return;
      }

      const { data, error: fetchError } = await supabase
        .from('groups')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setGroups(data || []);
    } catch (err: any) {
      console.error(err);
      setGlobalError('Error al cargar cuentas. Verifica la conexión a Supabase y que la base de datos esté actualizada.');
    } finally {
      setLoading(false);
    }
  }

  async function fetchGroupDetails(groupId: string) {
    setLoading(true);
    try {
      const { data: pData, error: pError } = await supabase
        .from('participants')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: true });
        
      const { data: eData, error: eError } = await supabase
        .from('expenses')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });

      const { data: sData, error: sError } = await supabase.from('expense_splits').select('*');

      if (pError) throw pError;
      if (eError) throw eError;
      if (sError) throw sError;

      setParticipants(pData || []);
      setExpenses(eData || []);
      setSplits(sData || []);
    } catch (err: any) {
      setGlobalError('Error cargando detalles de la cuenta.');
    } finally {
      setLoading(false);
    }
  }

  function showConfirm(title: string, message: string, onConfirm: () => void) {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  }

  function closeConfirm() {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
  }

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    
    if (!newGroupName.trim()) {
      setFormError('Por favor, ingresa un nombre para la cuenta.');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('groups')
        .insert([{ name: newGroupName.trim() }])
        .select();

      if (error) throw error;
      
      setGroups([data[0], ...groups]);
      setNewGroupName('');
      setSelectedGroup(data[0]); // Auto open
    } catch (err: any) {
      setFormError('Hubo un error al crear la cuenta. Intenta de nuevo.');
    }
  }

  function handleDeleteGroupClick(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    showConfirm(
      'Eliminar Cuenta',
      '¿Seguro que deseas eliminar esta cuenta y todo su historial? Esta acción no se puede deshacer.',
      async () => {
        try {
          const { error } = await supabase.from('groups').delete().eq('id', id);
          if (error) throw error;
          setGroups(groups.filter(g => g.id !== id));
          if (selectedGroup?.id === id) {
            setSelectedGroup(null);
          }
        } catch (err: any) {
          setGlobalError('Error al eliminar la cuenta.');
        }
      }
    );
  }

  async function addParticipant(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!newParticipantName.trim()) {
      setFormError('Por favor, ingresa el nombre del participante.');
      return;
    }
    if (!selectedGroup) return;

    try {
      const { data, error } = await supabase
        .from('participants')
        .insert([{ name: newParticipantName.trim(), group_id: selectedGroup.id }])
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

    if (!description.trim()) {
      setFormError('La descripción del gasto es obligatoria.');
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      setFormError('Ingresa un monto válido mayor a 0.');
      return;
    }
    if (!payerId) {
      setFormError('Selecciona la persona que pagó el gasto.');
      return;
    }
    if (selectedParticipants.length === 0) {
      setFormError('Debes seleccionar al menos un participante para dividir el gasto.');
      return;
    }
    if (!selectedGroup) return;

    try {
      if (editingExpenseId) {
        // Edit mode
        const { error: expError } = await supabase
          .from('expenses')
          .update({ 
            description: description.trim(), 
            amount: parseFloat(amount), 
            payer_id: payerId 
          })
          .eq('id', editingExpenseId);
          
        if (expError) throw expError;

        await supabase.from('expense_splits').delete().eq('expense_id', editingExpenseId);
        
        const splitsToInsert = selectedParticipants.map(pId => ({
          expense_id: editingExpenseId,
          participant_id: pId
        }));
        
        const { data: splData, error: splError } = await supabase
          .from('expense_splits')
          .insert(splitsToInsert)
          .select();
          
        if (splError) throw splError;

        setExpenses(expenses.map(exp => exp.id === editingExpenseId ? { ...exp, description: description.trim(), amount: parseFloat(amount), payer_id: payerId } : exp));
        setSplits([...splits.filter(s => s.expense_id !== editingExpenseId), ...(splData || [])]);
        
        setEditingExpenseId(null);
      } else {
        // Add mode
        const { data: expData, error: expError } = await supabase
          .from('expenses')
          .insert([{ 
            group_id: selectedGroup.id,
            description: description.trim(), 
            amount: parseFloat(amount), 
            payer_id: payerId 
          }])
          .select();

        if (expError) throw expError;
        
        const newExpense = expData[0];

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

  function handleDeleteExpenseClick(id: string) {
    showConfirm(
      'Eliminar Gasto',
      '¿Estás seguro de que quieres eliminar este gasto? Esto afectará los balances.',
      async () => {
        try {
          const { error } = await supabase.from('expenses').delete().eq('id', id);
          if (error) throw error;
          
          setExpenses(expenses.filter(e => e.id !== id));
          setSplits(splits.filter(s => s.expense_id !== id));
        } catch (err: any) {
          setGlobalError('Error al eliminar el gasto.');
        }
      }
    );
  }

  const balances = calculateBalances(participants, expenses, splits);
  const settlements = calculateSettlement(balances);
  
  const balanceSum = balances.reduce((sum, b) => sum + b.balance, 0);
  const isBalanceZero = Math.abs(balanceSum) < 0.01;

  if (loading && !selectedGroup) return <div className="p-8 text-center text-gray-500">Cargando...</div>;

  if (showLanding) {
    return <LandingPage onEnter={() => setShowLanding(false)} />;
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      
      {/* CUSTOM CONFIRM MODAL */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold text-gray-800">{confirmModal.title}</h3>
              <button onClick={closeConfirm} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <p className="text-gray-600 mb-6">{confirmModal.message}</p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={closeConfirm}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 font-medium rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmModal.onConfirm}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="mb-8">
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 -mx-4 md:-mx-8 -mt-4 md:-mt-8 px-4 md:px-8 py-5 mb-6 rounded-b-2xl">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-blue-500 p-2 rounded-xl">
                <Calculator size={22} className="text-white" />
              </div>
              <span className="text-xl font-bold text-white tracking-tight">Cuentas Claras</span>
            </div>
            {selectedGroup ? (
              <button 
                onClick={() => {
                  setSelectedGroup(null);
                  setFormError(null);
                }}
                className="flex items-center gap-1 text-blue-300 hover:text-white transition-colors text-sm"
              >
                <ArrowLeft size={18} /> Volver a cuentas
              </button>
            ) : (
              <button 
                onClick={() => setShowLanding(true)}
                className="text-blue-300 hover:text-white transition-colors text-sm"
              >
                Inicio
              </button>
            )}
          </div>
        </div>
      </header>

      {globalError && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6 flex gap-2 items-start border border-red-200">
          <AlertCircle className="shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-medium">Atención</p>
            <p className="text-sm">{globalError}</p>
          </div>
        </div>
      )}

      {/* VISTA DE HISTORIAL DE CUENTAS (GRUPOS) */}
      {!selectedGroup && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 border-b pb-4">Historial de Cuentas</h2>
          
          <form onSubmit={createGroup} className="mb-8">
            <div className="flex flex-col sm:flex-row gap-2">
              <input 
                type="text" 
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                placeholder="Nombre de la nueva cuenta (ej. Almuerzo, Fin de semana)" 
                className={`flex-1 px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${formError && !newGroupName.trim() ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
              />
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-colors font-medium">
                <Plus size={18} /> Crear Cuenta
              </button>
            </div>
            {formError && (
              <p className="text-red-500 text-sm mt-2 flex items-center gap-1">
                <AlertCircle size={14} /> {formError}
              </p>
            )}
          </form>

          <div className="space-y-3">
            {groups.length === 0 ? (
              <div className="text-center py-10 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                <FolderOpen className="mx-auto text-gray-400 mb-2" size={32} />
                <p className="text-gray-500">No tienes ninguna cuenta activa.</p>
                <p className="text-sm text-gray-400 mt-1">Crea una para empezar a dividir gastos.</p>
              </div>
            ) : (
              groups.map(group => (
                <div 
                  key={group.id} 
                  onClick={() => setSelectedGroup(group)}
                  className="flex justify-between items-center p-4 rounded-lg border border-gray-200 hover:border-blue-500 hover:shadow-md cursor-pointer transition-all bg-gray-50 hover:bg-white group/item"
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-100 p-2 rounded-lg text-blue-700">
                      <FolderOpen size={24} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800 text-lg">{group.name}</h3>
                      <p className="text-xs text-gray-400">Creado el {new Date(group.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <button 
                    onClick={(e) => handleDeleteGroupClick(group.id, e)}
                    className="text-gray-400 hover:text-red-600 p-2 rounded-full hover:bg-red-50 transition-all opacity-0 group-hover/item:opacity-100"
                    title="Eliminar cuenta"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* VISTA DE UNA CUENTA ESPECIFICA */}
      {selectedGroup && (
        <>
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6 flex items-center gap-3">
            <FolderOpen className="text-blue-600" size={24} />
            <h2 className="text-xl font-bold text-gray-800">{selectedGroup.name}</h2>
          </div>

          <div className="flex gap-2 mb-6 bg-white p-1 rounded-lg shadow-sm border border-gray-100 overflow-x-auto">
            <button 
              onClick={() => setActiveTab('participants')}
              className={`flex-1 flex justify-center items-center gap-2 py-2 px-4 rounded-md transition-colors whitespace-nowrap ${activeTab === 'participants' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <Users size={18} /> Participantes
            </button>
            <button 
              onClick={() => setActiveTab('expenses')}
              className={`flex-1 flex justify-center items-center gap-2 py-2 px-4 rounded-md transition-colors whitespace-nowrap ${activeTab === 'expenses' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <Receipt size={18} /> Gastos
            </button>
            <button 
              onClick={() => setActiveTab('balances')}
              className={`flex-1 flex justify-center items-center gap-2 py-2 px-4 rounded-md transition-colors whitespace-nowrap ${activeTab === 'balances' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <Calculator size={18} /> Liquidación
            </button>
          </div>

          <main>
            {/* PARTICIPANTES TAB */}
            {activeTab === 'participants' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 md:p-6 border-b border-gray-100">
                  <h2 className="text-xl font-semibold mb-4">Agregar Participante</h2>
                  <form onSubmit={addParticipant} className="mb-2">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input 
                        type="text" 
                        value={newParticipantName}
                        onChange={e => setNewParticipantName(e.target.value)}
                        placeholder="Nombre de la persona (ej. Ana)" 
                        className={`flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${formError ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                      />
                      <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors">
                        <Plus size={18} /> Agregar
                      </button>
                    </div>
                    {formError && (
                      <p className="text-red-500 text-sm mt-2 flex items-center gap-1">
                        <AlertCircle size={14} /> {formError}
                      </p>
                    )}
                  </form>
                </div>
                <div className="p-4 md:p-6">
                  <h3 className="font-medium text-gray-700 mb-4">Lista de Participantes ({participants.length})</h3>
                  {participants.length === 0 ? (
                    <p className="text-gray-500 text-sm">No hay participantes aún.</p>
                  ) : (
                    <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {participants.map(p => (
                        <li key={p.id} className="bg-gray-50 px-4 py-3 rounded-lg border border-gray-100 text-gray-800 text-center font-medium shadow-sm">
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
              <div className="grid lg:grid-cols-5 gap-6">
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6 h-fit">
                  <h2 className="text-xl font-semibold mb-4">{editingExpenseId ? 'Editar Gasto' : 'Registrar Gasto'}</h2>
                  <form onSubmit={saveExpense} className="space-y-4">
                    {formError && (
                      <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex gap-1 items-start border border-red-200">
                        <AlertCircle size={16} className="shrink-0 mt-0.5" />
                        <span>{formError}</span>
                      </div>
                    )}
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                      <input 
                        type="text" 
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Ej. Cena, Gasolina, Alquiler" 
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Monto (Bs.)</label>
                      <input 
                        type="number" 
                        step="10"
                        min="0"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        placeholder="100" 
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
                          <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer p-1 hover:bg-gray-100 rounded">
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
                              className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
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
                        {editingExpenseId ? 'Guardar Cambios' : 'Guardar'}
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
                
                <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6">
                  <h2 className="text-xl font-semibold mb-4">Historial de Gastos</h2>
                  {expenses.length === 0 ? (
                    <div className="text-center py-10 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                      <Receipt className="mx-auto text-gray-400 mb-2" size={32} />
                      <p className="text-gray-500">No hay gastos registrados en esta cuenta.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {expenses.map(exp => {
                        const payer = participants.find(p => p.id === exp.payer_id)?.name || 'Desconocido';
                        const expSplits = splits.filter(s => s.expense_id === exp.id);
                        return (
                          <div key={exp.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-4 rounded-lg border border-gray-100 hover:border-blue-200 hover:shadow-sm transition-all group gap-4">
                            <div>
                              <p className="font-semibold text-gray-800 text-lg">{exp.description}</p>
                              <p className="text-sm text-gray-600 mt-1">
                                {payer} pagó <span className="font-medium text-gray-800">Bs. {exp.amount}</span>
                              </p>
                              <p className="text-xs text-gray-400 mt-1 bg-gray-100 inline-block px-2 py-0.5 rounded">
                                Dividido entre {expSplits.length} {expSplits.length === 1 ? 'persona' : 'personas'}
                              </p>
                            </div>
                            <div className="flex gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-all self-end sm:self-center">
                              <button 
                                onClick={() => startEditExpense(exp)}
                                className="text-blue-500 hover:text-blue-700 p-2 rounded-full hover:bg-blue-50 bg-gray-50 sm:bg-transparent"
                                title="Editar gasto"
                              >
                                <Edit2 size={18} />
                              </button>
                              <button 
                                onClick={() => handleDeleteExpenseClick(exp.id)}
                                className="text-red-500 hover:text-red-700 p-2 rounded-full hover:bg-red-50 bg-gray-50 sm:bg-transparent"
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
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold">Balances</h2>
                    {!isBalanceZero && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium flex items-center gap-1">
                        <AlertCircle size={12}/> Error: {balanceSum.toFixed(2)}
                      </span>
                    )}
                  </div>
                  
                  <ul className="space-y-3">
                    {balances.map(b => (
                      <li key={b.participantId} className="flex justify-between items-center p-3 rounded-lg bg-gray-50 border border-gray-100">
                        <span className="font-medium text-gray-800">{b.name}</span>
                        <span className={`font-bold ${b.balance > 0 ? 'text-green-600' : b.balance < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                          {b.balance > 0 ? '+' : ''}{b.balance.toFixed(2)} Bs.
                        </span>
                      </li>
                    ))}
                    {balances.length === 0 && <p className="text-sm text-gray-500">No hay datos suficientes</p>}
                  </ul>
                  
                  <div className="mt-6 text-xs text-gray-600 p-4 bg-blue-50 rounded-lg border border-blue-100">
                    <strong className="text-blue-800 text-sm block mb-2">¿Cómo leer esto?</strong>
                    <ul className="list-disc pl-4 space-y-1">
                      <li><span className="text-green-600 font-medium">Verde (+)</span>: A esta persona le deben dinero (pagó de más).</li>
                      <li><span className="text-red-600 font-medium">Rojo (-)</span>: Esta persona debe dinero (le pagaron su parte).</li>
                    </ul>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6">
                  <h2 className="text-xl font-semibold mb-6">Cómo quedar a mano</h2>
                  
                  {settlements.length === 0 ? (
                    <div className="text-center py-10 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                      <p className="text-gray-700 font-medium">Están todos a mano</p>
                      <p className="text-sm text-gray-500 mt-1">No hay deudas pendientes.</p>
                    </div>
                  ) : (
                    <ul className="space-y-4">
                      {settlements.map((t, i) => (
                        <li key={i} className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 p-4 rounded-lg border border-gray-200 bg-white shadow-sm">
                          <div className="w-full sm:w-1/3 text-center sm:text-right font-medium text-red-600 text-lg">{t.from}</div>
                          
                          <div className="flex flex-col items-center justify-center w-full sm:w-1/3">
                            <span className="text-xs text-gray-500 font-semibold mb-1 uppercase tracking-wider">paga a</span>
                            <div className="hidden sm:block w-full h-px bg-gray-300 relative">
                              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 border-t-2 border-r-2 border-gray-300 transform rotate-45 translate-x-1"></div>
                            </div>
                            <span className="font-bold text-gray-800 mt-1 text-sm bg-gray-100 px-3 py-1 rounded-full border border-gray-200">
                              Bs. {t.amount.toFixed(2)}
                            </span>
                          </div>
                          
                          <div className="w-full sm:w-1/3 text-center sm:text-left font-medium text-green-600 text-lg">{t.to}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </main>
        </>
      )}
    </div>
  );
}

export default App;
