import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import type { Group } from './utils';
import { Trash2, Plus, FolderOpen, AlertCircle, Copy, Check } from 'lucide-react';
import { Navbar, ConfirmModal, FormError, useConfirmModal, JoinModal } from './components';
import { useAuth } from './hooks/useAuth';

function generateJoinCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function slugify(name: string, code: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `${slug}-${code.toLowerCase()}`;
}

export default function CuentasPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const [groups, setGroups] = useState<(Group & { join_code: string; owner_id: string })[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [loading, setLoading] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { modal, showConfirm, closeConfirm } = useConfirmModal();

  useEffect(() => { if (user) fetchGroups(); }, [user]);

  async function fetchGroups() {
    setLoading(true);
    setGlobalError(null);
    try {
      // Get groups where user is a member (via group_members table)
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setGroups(data || []);
    } catch (err: any) {
      console.error('fetchGroups error:', err);
      setGlobalError(`Error al cargar cuentas: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  }

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!newGroupName.trim()) { setFormError('Ingresa un nombre para la cuenta.'); return; }
    if (!user) return;

    try {
      let joinCode = generateJoinCode();
      // Try to generate a unique code
      let attempts = 0;
      while (attempts < 5) {
        const { data: existing } = await supabase.from('groups').select('id').eq('join_code', joinCode).maybeSingle();
        if (!existing) break;
        joinCode = generateJoinCode();
        attempts++;
      }

      const { data, error } = await supabase
        .from('groups')
        .insert([{ name: newGroupName.trim(), owner_id: user.id, join_code: joinCode }])
        .select();
      if (error) throw error;

      setGroups([data[0], ...groups]);
      setNewGroupName('');
      navigate(`/cuenta/${slugify(data[0].name, data[0].join_code)}`);
    } catch (err: any) {
      console.error('createGroup error:', err);
      setFormError(`Error al crear la sala: ${err.message || err}`);
    }
  }

  async function handleJoinByCode(code: string) {
    if (!user) return;
    // Use RPC to find group bypassing RLS
    const { data: found, error: findErr } = await supabase.rpc('find_group_by_code', { p_code: code });
    if (findErr || !found || found.length === 0) throw new Error('Sala no encontrada. Verifica el codigo.');

    const group = found[0];

    // Check if already a member
    const { data: already } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', group.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (already) throw new Error('Ya eres miembro de esta sala.');

    // Join
    const { error: joinErr } = await supabase
      .from('group_members')
      .insert([{ group_id: group.id, user_id: user.id }]);
    if (joinErr) throw new Error('No se pudo unir a la sala.');

    await fetchGroups();
    navigate(`/cuenta/${slugify(group.name, code)}`);
  }

  function handleDeleteGroup(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    showConfirm('Eliminar Sala', 'Se eliminara la sala y todo su historial. No se puede deshacer.', async () => {
      try {
        const { error } = await supabase.from('groups').delete().eq('id', id);
        if (error) throw error;
        setGroups(groups.filter(g => g.id !== id));
      } catch (err: any) {
        setGlobalError('Error al eliminar.');
      }
    });
  }

  async function copyCode(code: string, id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const userName = user?.user_metadata?.name || user?.email || '';

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)] transition-colors">
        <Navbar backLabel="Inicio" backTo="/" userName={userName} onSignOut={signOut} />
        <div className="p-8 text-center text-[var(--text-muted)]">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] transition-colors">
      <Navbar backLabel="Inicio" backTo="/" userName={userName} onSignOut={signOut} />
      <ConfirmModal isOpen={modal.isOpen} title={modal.title} message={modal.message} onConfirm={modal.onConfirm} onCancel={closeConfirm} />
      <JoinModal isOpen={showJoinModal} onClose={() => setShowJoinModal(false)} onJoin={handleJoinByCode} />

      <div className="max-w-3xl mx-auto px-4 md:px-8 pb-12 animate-fade-in">

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Mis Salas</h1>
            <p className="text-sm text-[var(--text-secondary)]">Crea o unete a una sala de gastos compartidos</p>
          </div>
          <button
            onClick={() => setShowJoinModal(true)}
            className="text-sm font-medium text-indigo-500 border border-indigo-300 dark:border-indigo-500/40 px-4 py-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors self-start sm:self-auto"
          >
            Unirse con codigo
          </button>
        </div>

        {globalError && (
          <div className="bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 p-3 rounded-lg mb-4 flex gap-2 items-start border border-red-200 dark:border-red-500/20 text-sm">
            <AlertCircle size={16} className="shrink-0 mt-0.5" /><span>{globalError}</span>
          </div>
        )}

        {/* Create */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 mb-5 transition-colors">
          <form onSubmit={createGroup}>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                placeholder="Nombre de la sala (ej. Viaje a Samaipata)"
                className="flex-1 px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors placeholder:text-[var(--text-muted)]"
              />
              <button type="submit" className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-1.5 text-sm font-medium transition-colors whitespace-nowrap">
                <Plus size={16} /> Nueva Sala
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
              <p className="text-[var(--text-secondary)] text-sm font-medium">No tienes salas todavia</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Crea una nueva o unete con un codigo.</p>
            </div>
          ) : (
            groups.map(group => {
              const isOwner = group.owner_id === user?.id;
              const isCopied = copiedId === group.id;
              return (
                <div
                  key={group.id}
                  onClick={() => navigate(`/cuenta/${slugify(group.name, group.join_code)}`)}
                  className="flex items-center gap-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-indigo-300 dark:hover:border-indigo-500/40 cursor-pointer transition-colors group/item"
                >
                  <div className="bg-indigo-50 dark:bg-indigo-500/10 p-2 rounded-lg text-indigo-500 shrink-0">
                    <FolderOpen size={20} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-[var(--text-primary)] text-sm truncate">{group.name}</h3>
                      {isOwner && <span className="text-[10px] bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded font-semibold shrink-0">DUEÑO</span>}
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{new Date(group.created_at).toLocaleDateString()}</p>
                  </div>

                  {/* Code + actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={e => copyCode(group.join_code, group.id, e)}
                      className="hidden sm:flex items-center gap-1 text-[10px] font-mono font-bold bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-indigo-500 px-2 py-1 rounded-md border border-[var(--border)] transition-colors"
                      title="Copiar codigo de sala"
                    >
                      {isCopied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                      {group.join_code}
                    </button>

                    {isOwner && (
                      <button
                        onClick={e => handleDeleteGroup(group.id, e)}
                        className="text-[var(--text-muted)] hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
                        title="Eliminar sala"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
