import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import type { Group } from './utils';
import { Trash2, Plus, FolderOpen, AlertCircle } from 'lucide-react';
import { Navbar, ConfirmModal, FormError, useConfirmModal } from './components';

export default function CuentasPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<Group[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [loading, setLoading] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { modal, showConfirm, closeConfirm } = useConfirmModal();

  useEffect(() => { fetchGroups(); }, []);

  async function fetchGroups() {
    setLoading(true);
    setGlobalError(null);
    try {
      if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
        setGlobalError('Faltan variables de entorno de Supabase. Configura .env.local');
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.from('groups').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setGroups(data || []);
    } catch (err: any) {
      setGlobalError('Error al cargar cuentas. Verifica la conexion a Supabase.');
    } finally {
      setLoading(false);
    }
  }

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!newGroupName.trim()) { setFormError('Ingresa un nombre para la cuenta.'); return; }
    try {
      const { data, error } = await supabase.from('groups').insert([{ name: newGroupName.trim() }]).select();
      if (error) throw error;
      setGroups([data[0], ...groups]);
      setNewGroupName('');
      navigate(`/cuenta/${data[0].id}`);
    } catch (err: any) {
      setFormError('Error al crear la cuenta.');
    }
  }

  function handleDeleteGroup(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    showConfirm('Eliminar Cuenta', 'Se eliminara la cuenta y todo su historial. No se puede deshacer.', async () => {
      try {
        const { error } = await supabase.from('groups').delete().eq('id', id);
        if (error) throw error;
        setGroups(groups.filter(g => g.id !== id));
      } catch (err: any) {
        setGlobalError('Error al eliminar.');
      }
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)] transition-colors">
        <Navbar backLabel="Inicio" backTo="/" />
        <div className="p-8 text-center text-[var(--text-muted)]">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] transition-colors">
      <Navbar backLabel="Inicio" backTo="/" />
      <ConfirmModal isOpen={modal.isOpen} title={modal.title} message={modal.message} onConfirm={modal.onConfirm} onCancel={closeConfirm} />

      <div className="max-w-3xl mx-auto px-4 md:px-8 pb-12 animate-fade-in">

        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">Mis Cuentas</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-6">Administra tus cuentas de gastos compartidos</p>

        {globalError && (
          <div className="bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 p-3 rounded-lg mb-4 flex gap-2 items-start border border-red-200 dark:border-red-500/20 text-sm">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{globalError}</span>
          </div>
        )}

        {/* Create */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5 mb-6 transition-colors">
          <form onSubmit={createGroup}>
            <div className="flex flex-col sm:flex-row gap-2">
              <input type="text" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Nombre de la cuenta (ej. Almuerzo, Viaje)" className="flex-1 px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors placeholder:text-[var(--text-muted)]" />
              <button type="submit" className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-1.5 text-sm font-medium transition-colors">
                <Plus size={16} /> Crear
              </button>
            </div>
            <FormError message={formError} />
          </form>
        </div>

        {/* List */}
        <div className="space-y-2">
          {groups.length === 0 ? (
            <div className="text-center py-12 bg-[var(--bg-card)] border border-dashed border-[var(--border)] rounded-xl transition-colors">
              <FolderOpen className="mx-auto text-[var(--text-muted)] mb-2" size={36} />
              <p className="text-[var(--text-secondary)] text-sm">No hay cuentas todavia</p>
            </div>
          ) : (
            groups.map(group => (
              <div key={group.id} onClick={() => navigate(`/cuenta/${group.id}`)} className="flex justify-between items-center p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-indigo-300 dark:hover:border-indigo-500/40 cursor-pointer transition-colors group/item">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-50 dark:bg-indigo-500/10 p-2 rounded-lg text-indigo-500">
                    <FolderOpen size={20} />
                  </div>
                  <div>
                    <h3 className="font-medium text-[var(--text-primary)] text-sm">{group.name}</h3>
                    <p className="text-xs text-[var(--text-muted)]">{new Date(group.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <button onClick={(e) => handleDeleteGroup(group.id, e)} className="text-[var(--text-muted)] hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-all opacity-0 group-hover/item:opacity-100" title="Eliminar">
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
