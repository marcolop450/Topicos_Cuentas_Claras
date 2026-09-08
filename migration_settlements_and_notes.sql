-- ============================================================
-- CUENTAS CLARAS - Migracion Muerte a la Deuda y Titulo/Notas
-- Script INCREMENTAL (no destructivo) - v5
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- 1. Agregar columna 'notes' a expenses para descripcion detallada
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

-- 2. Crear tabla de liquidaciones / pagos de deuda
CREATE TABLE IF NOT EXISTS settlements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  from_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE, -- Deudor
  to_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,   -- Acreedor
  amount numeric NOT NULL,
  currency varchar(3) NOT NULL DEFAULT 'BOB',
  amount_usd numeric NOT NULL DEFAULT 0,
  settlement_type varchar(20) NOT NULL DEFAULT 'PAYMENT', -- 'PAYMENT' o 'FORGIVEN'
  status varchar(20) NOT NULL DEFAULT 'PENDING',          -- 'PENDING', 'CONFIRMED', 'REJECTED'
  notes text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now())
);

-- 3. Habilitar RLS y politicas para settlements
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'settlements' AND policyname = 'members_can_manage_settlements'
  ) THEN
    CREATE POLICY "members_can_manage_settlements"
      ON settlements FOR ALL
      USING (
        group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- 4. Indices para performance
CREATE INDEX IF NOT EXISTS idx_settlements_group ON settlements(group_id);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements(status);
