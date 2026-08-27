-- ============================================================
-- CUENTAS CLARAS - Script Completo BD v2 con Autenticación
-- Ejecuta esto en el SQL Editor de Supabase
-- ============================================================

-- 1. Limpiar BD anterior
DROP TABLE IF EXISTS expense_splits CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS participants CASCADE;
DROP TABLE IF EXISTS group_members CASCADE;
DROP TABLE IF EXISTS groups CASCADE;

-- 2. Tabla de Grupos/Salas
CREATE TABLE groups (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  owner_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  join_code   VARCHAR(6) NOT NULL UNIQUE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- 3. Tabla de miembros de la sala (usuarios que se unieron)
CREATE TABLE group_members (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id   UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  joined_at  TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  UNIQUE(group_id, user_id)
);

-- 4. Tabla de participantes (personas nombradas dentro de la sala)
CREATE TABLE participants (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id   UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES auth.users(id),  -- nullable: puede ser agregado manual
  name       TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- 5. Tabla de gastos
CREATE TABLE expenses (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id    UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  amount      NUMERIC(10, 2) NOT NULL,
  payer_id    UUID REFERENCES participants(id) ON DELETE CASCADE NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- 6. Tabla de divisiones de gastos
CREATE TABLE expense_splits (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id     UUID REFERENCES expenses(id) ON DELETE CASCADE NOT NULL,
  participant_id UUID REFERENCES participants(id) ON DELETE CASCADE NOT NULL
);

-- ============================================================
-- ÍNDICES para performance
-- ============================================================
CREATE INDEX idx_groups_owner ON groups(owner_id);
CREATE INDEX idx_groups_join_code ON groups(join_code);
CREATE INDEX idx_group_members_user ON group_members(user_id);
CREATE INDEX idx_group_members_group ON group_members(group_id);
CREATE INDEX idx_participants_group ON participants(group_id);
CREATE INDEX idx_expenses_group ON expenses(group_id);

-- ============================================================
-- FUNCIÓN: Generar código de sala único (6 caracteres)
-- ============================================================
CREATE OR REPLACE FUNCTION generate_join_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  code  TEXT := '';
  i     INT;
BEGIN
  FOR i IN 1..6 LOOP
    code := code || substr(chars, floor(random() * length(chars) + 1)::INT, 1);
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCIÓN: Al crear un grupo, auto-agregar owner como miembro
-- ============================================================
CREATE OR REPLACE FUNCTION on_group_created()
RETURNS TRIGGER AS $$
BEGIN
  -- Agregar owner como miembro automáticamente
  INSERT INTO group_members(group_id, user_id)
  VALUES (NEW.id, NEW.owner_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_group_created
  AFTER INSERT ON groups
  FOR EACH ROW EXECUTE FUNCTION on_group_created();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_splits ENABLE ROW LEVEL SECURITY;

-- groups: ver solo las salas donde eres miembro
CREATE POLICY "members_can_view_groups"
  ON groups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = groups.id
        AND group_members.user_id = auth.uid()
    )
  );

-- groups: solo autenticados pueden crear salas
CREATE POLICY "auth_can_create_groups"
  ON groups FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- groups: solo el owner puede eliminar su sala
CREATE POLICY "owner_can_delete_group"
  ON groups FOR DELETE
  USING (auth.uid() = owner_id);

-- groups: solo el owner puede actualizar su sala
CREATE POLICY "owner_can_update_group"
  ON groups FOR UPDATE
  USING (auth.uid() = owner_id);

-- group_members: ver miembros del grupo si eres miembro
CREATE POLICY "members_can_view_members"
  ON group_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
    )
  );

-- group_members: insertar solo tu propio registro
CREATE POLICY "user_can_join_group"
  ON group_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- group_members: solo puedes eliminarte a ti mismo (salir de sala)
CREATE POLICY "user_can_leave_group"
  ON group_members FOR DELETE
  USING (auth.uid() = user_id);

-- participants: miembros del grupo pueden ver/crear/eliminar participantes
CREATE POLICY "members_can_manage_participants"
  ON participants FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = participants.group_id
        AND group_members.user_id = auth.uid()
    )
  );

-- expenses: miembros del grupo pueden operar
CREATE POLICY "members_can_manage_expenses"
  ON expenses FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = expenses.group_id
        AND group_members.user_id = auth.uid()
    )
  );

-- expense_splits: miembros del grupo pueden operar
CREATE POLICY "members_can_manage_splits"
  ON expense_splits FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM expenses e
      JOIN group_members gm ON gm.group_id = e.group_id
      WHERE e.id = expense_splits.expense_id
        AND gm.user_id = auth.uid()
    )
  );

-- ============================================================
-- PERMISOS para anon (solo para join via código, necesita SELECT en groups)
-- Nota: La función de "buscar grupo por código" la hacemos con una
-- función RPC que bypasses RLS de forma segura.
-- ============================================================
CREATE OR REPLACE FUNCTION find_group_by_code(p_code TEXT)
RETURNS TABLE(id UUID, name TEXT, owner_id UUID) AS $$
BEGIN
  RETURN QUERY
    SELECT g.id, g.name, g.owner_id
    FROM groups g
    WHERE UPPER(g.join_code) = UPPER(p_code);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- VISTA: profile names desde auth.users metadata
-- ============================================================
CREATE OR REPLACE VIEW user_profiles AS
  SELECT id, raw_user_meta_data->>'name' AS name, email
  FROM auth.users;

GRANT SELECT ON user_profiles TO authenticated;
