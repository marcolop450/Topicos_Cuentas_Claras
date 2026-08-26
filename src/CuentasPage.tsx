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

  useEffect(() => {
    fetchGroups();
  }, []);

  async function fetchGroups() {
    setLoading(true);
    setGlobalError(null);
    try {
      if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
        setGlobalError('Faltan variables de entorno de Supabase. Configura .env.local');
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setGroups(data || []);
    } catch (err: any) {
      console.error(err);
      setGlobalError('Error al cargar cuentas. Verifica la conexion a Supabase.');
    } finally {
      setLoading(false);
    }
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
      const newGroup = data[0];
      setGroups([newGroup, ...groups]);
      setNewGroupName('');
      // Navigate to the new group
      navigate(`/cuenta/${newGroup.id}`);
    } catch (err: any) {
      setFormError('Hubo un error al crear la cuenta. Intenta de nuevo.');
    }
  }

  function handleDeleteGroup(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    showConfirm(
      'Eliminar Cuenta',
      'Esta accion eliminara la cuenta y todo su historial de gastos. No se puede deshacer.',
      async () => {
        try {
          const { error } = await supabase.from('groups').delete().eq('id', id);
          if (error) throw error;
          setGroups(groups.filter(g => g.id !== id));
        } catch (err: any) {
          setGlobalError('Error al eliminar la cuenta.');
        }
      }
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar backLabel="Inicio" backTo="/" />
        <div className="p-8 text-center text-gray-500">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar backLabel="Inicio" backTo="/" />
      <ConfirmModal
        isOpen={modal.isOpen}
        title={modal.title}
        message={modal.message}
        onConfirm={modal.onConfirm}
        onCancel={closeConfirm}
      />

      <div className="max-w-5xl mx-auto px-4 md:px-8 pb-12">
        <div className="page-enter">
          {/* Page title */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-800 animate-fade-in-up">Mis Cuentas</h1>
            <p className="text-gray-500 mt-1 animate-fade-in-up delay-100">Crea y administra tus cuentas de gastos compartidos</p>
          </div>

          {globalError && (
            <div className="bg-red-50 text-red-700 p-4 rounded-xl mb-6 flex gap-2 items-start border border-red-200 animate-fade-in">
              <AlertCircle className="shrink-0 mt-0.5" size={20} />
              <div>
                <p className="font-medium">Atencion</p>
                <p className="text-sm">{globalError}</p>
              </div>
            </div>
          )}

          {/* Create group form */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8 animate-fade-in-up delay-200">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Nueva Cuenta</h2>
            <form onSubmit={createGroup}>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  placeholder="Nombre de la cuenta (ej. Almuerzo equipo, Viaje Samaipata)"
                  className={`flex-1 px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors ${formError ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}
                />
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 transition-all duration-200 font-medium hover:shadow-lg hover:shadow-blue-500/20 hover:-translate-y-0.5 active:translate-y-0"
                >
                  <Plus size={18} /> Crear Cuenta
                </button>
              </div>
              <FormError message={formError} />
            </form>
          </div>

          {/* Groups list */}
          <div className="space-y-3">
            {groups.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-300 animate-fade-in-up delay-300">
                <FolderOpen className="mx-auto text-gray-300 mb-3" size={48} />
                <p className="text-gray-500 font-medium text-lg">No tienes ninguna cuenta activa</p>
                <p className="text-sm text-gray-400 mt-1">Crea una para empezar a dividir gastos.</p>
              </div>
            ) : (
              groups.map((group, index) => (
                <div
                  key={group.id}
                  onClick={() => navigate(`/cuenta/${group.id}`)}
                  className={`flex justify-between items-center p-5 rounded-2xl border border-gray-100 bg-white hover:border-blue-300 hover:shadow-lg hover:shadow-blue-500/5 cursor-pointer transition-all duration-300 hover:-translate-y-0.5 group/item animate-fade-in-up`}
                  style={{ animationDelay: `${200 + index * 80}ms` }}
                >
                  <div className="flex items-center gap-4">
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-3 rounded-xl text-white shadow-md shadow-blue-500/20">
                      <FolderOpen size={24} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800 text-lg group-hover/item:text-blue-700 transition-colors">{group.name}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">Creado el {new Date(group.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDeleteGroup(group.id, e)}
                    className="text-gray-300 hover:text-red-500 p-2 rounded-xl hover:bg-red-50 transition-all opacity-0 group-hover/item:opacity-100"
                    title="Eliminar cuenta"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
