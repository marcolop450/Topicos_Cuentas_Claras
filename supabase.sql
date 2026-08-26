-- Ejecuta este script en el SQL Editor de tu proyecto en Supabase

-- 1. Crear tabla de participantes
CREATE TABLE participants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Crear tabla de gastos
CREATE TABLE expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  description TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  payer_id UUID REFERENCES participants(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Crear tabla para relacionar quiénes participan en un gasto (para dividir)
CREATE TABLE expense_splits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE NOT NULL,
  participant_id UUID REFERENCES participants(id) ON DELETE CASCADE NOT NULL
);

-- Configurar políticas de seguridad (Row Level Security - RLS)
-- Para este proyecto permitiremos acceso anónimo total para facilitar el desarrollo rápido.
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for anon participants" ON participants FOR ALL USING (true);
CREATE POLICY "Allow all operations for anon expenses" ON expenses FOR ALL USING (true);
CREATE POLICY "Allow all operations for anon expense_splits" ON expense_splits FOR ALL USING (true);
