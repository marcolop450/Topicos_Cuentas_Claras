-- ============================================================
-- CUENTAS CLARAS - Migración MultiMoneda
-- Script INCREMENTAL (no destructivo) - v3
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- 1. Agregar columna 'currency' a expenses (default BOB para gastos existentes)
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'BOB';

-- 2. Agregar columna 'amount_usd' a expenses
--    Snapshot del monto en USD al momento de guardar el gasto.
--    Para gastos legacy (BOB sin tasa real), se inicializa en 0 y el
--    frontend los convierte en tiempo real con Frankfurter.
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS amount_usd NUMERIC(12, 4) NOT NULL DEFAULT 0;

-- 3. Actualizar índice de performance para consultas por moneda (opcional)
CREATE INDEX IF NOT EXISTS idx_expenses_currency ON expenses(currency);

-- ============================================================
-- VERIFICACIÓN (ejecutar después para confirmar)
-- ============================================================
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'expenses'
-- ORDER BY ordinal_position;
