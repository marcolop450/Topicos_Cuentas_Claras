-- ============================================================
-- CUENTAS CLARAS - Migracion Modos de Division y Gastos Personales
-- Script INCREMENTAL (no destructivo) - v4
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- 1. Agregar columna 'split_mode' a expenses (default EQUAL)
--    Valores permitidos: 'EQUAL', 'PERCENTAGE', 'CUSTOM', 'PERSONAL'
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS split_mode VARCHAR(20) NOT NULL DEFAULT 'EQUAL';

-- 2. Agregar columna 'share_value' a expense_splits
--    Almacena el porcentaje (%) o el monto personalizado asignado
ALTER TABLE expense_splits
  ADD COLUMN IF NOT EXISTS share_value NUMERIC(10, 2) DEFAULT NULL;

-- 3. Indices para performance
CREATE INDEX IF NOT EXISTS idx_expenses_split_mode ON expenses(split_mode);
