// Hook para obtener tipos de cambio en tiempo real desde Frankfurter API
// No requiere clave de API. Actualiza diariamente desde 84 bancos centrales.
// Referencia: https://frankfurter.dev

export const SUPPORTED_CURRENCIES = ['USD', 'BOB', 'EUR', 'ARS', 'BRL', 'CLP', 'PEN', 'COP'] as const;
export type CurrencyCode = typeof SUPPORTED_CURRENCIES[number];

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  USD: 'USD - Dólar americano',
  BOB: 'BOB - Boliviano',
  EUR: 'EUR - Euro',
  ARS: 'ARS - Peso argentino',
  BRL: 'BRL - Real brasileño',
  CLP: 'CLP - Peso chileno',
  PEN: 'PEN - Sol peruano',
  COP: 'COP - Peso colombiano',
};

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: '$',
  BOB: 'Bs.',
  EUR: '€',
  ARS: '$',
  BRL: 'R$',
  CLP: '$',
  PEN: 'S/',
  COP: '$',
};

// Rates: cuantas unidades de la moneda equivalen a 1 USD
// Ej: { BOB: 6.96 } significa 1 USD = 6.96 BOB
export type RatesMap = Record<string, number>;

const CACHE_KEY = 'cc_exchange_rates';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

interface CachedRates {
  rates: RatesMap;
  fetchedAt: number;
}

function getCachedRates(): RatesMap | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedRates = JSON.parse(raw);
    if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) return null;
    return cached.rates;
  } catch {
    return null;
  }
}

function setCachedRates(rates: RatesMap): void {
  try {
    const payload: CachedRates = { rates, fetchedAt: Date.now() };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // sessionStorage no disponible — continuar sin cache
  }
}

// Tasas de respaldo si la API falla (actualizadas Sep 2026)
// Fuente: Frankfurter API - 1 USD = X unidades de cada moneda
const FALLBACK_RATES: RatesMap = {
  USD: 1,
  BOB: 12.5506, // Tasa real Sep 2026 (antes era 6.96 - INCORRECTO)
  EUR: 0.86022,
  ARS: 1508.2,
  BRL: 5.1253,
  CLP: 933.83,
  PEN: 3.3595,
  COP: 3126.04,
};

/**
 * Obtiene tasas de cambio con base en USD desde Frankfurter API v2.
 * Resultado: { USD: 1, BOB: 12.55, EUR: 0.86, ... }
 * (1 USD = X unidades de cada moneda)
 *
 * IMPORTANTE: Frankfurter v2 devuelve un ARRAY de objetos:
 * [{ date, base, quote, rate }, ...]
 * NO un objeto { rates: { BOB: X } } como en v1.
 */
export async function fetchRatesFromUSD(): Promise<{ rates: RatesMap; fromCache: boolean; fromFallback: boolean }> {
  // 1. Intentar cache
  const cached = getCachedRates();
  if (cached) {
    return { rates: cached, fromCache: true, fromFallback: false };
  }

  // 2. Llamar a Frankfurter v2
  try {
    const currencies = SUPPORTED_CURRENCIES.filter(c => c !== 'USD').join(',');
    const res = await fetch(
      `https://api.frankfurter.dev/v2/rates?base=USD&quotes=${currencies}`,
      { signal: AbortSignal.timeout(6000) }
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // La API v2 devuelve un array: [{ date, base, quote, rate }, ...]
    const data: Array<{ quote: string; rate: number }> = await res.json();
    // Construir el mapa de tasas desde el array de la v2
    // Array: [{ quote: "BOB", rate: 12.5506 }, { quote: "EUR", rate: 0.86 }, ...]
    const rates: RatesMap = data.reduce<RatesMap>(
      (acc, item) => { acc[item.quote] = item.rate; return acc; },
      { USD: 1 }
    );

    // Rellenar con fallback cualquier moneda que no haya llegado de la API
    for (const c of SUPPORTED_CURRENCIES) {
      if (!(c in rates)) rates[c] = FALLBACK_RATES[c] ?? 1;
    }

    setCachedRates(rates);
    return { rates, fromCache: false, fromFallback: false };
  } catch {
    // 3. Fallback estático si la API no responde
    return { rates: { ...FALLBACK_RATES }, fromCache: false, fromFallback: true };
  }
}

/**
 * Convierte un monto de cualquier moneda a USD.
 * rates[currency] = cuantas unidades de esa moneda equivalen a 1 USD
 * Ej: toUSD(20, 'BOB', { BOB: 12.5506 }) => 20 / 12.5506 ≈ 1.59 USD
 */
export function toUSD(amount: number, currency: string, rates: RatesMap): number {
  const rate = rates[currency] ?? 1;
  if (rate === 0) return 0;
  return Math.round((amount / rate) * 10000) / 10000;
}

/**
 * Formatea un monto en su moneda original de forma legible con separador de miles.
 * Ej: formatOriginal(1800, 'BOB') => 'Bs. 1,800.00'
 */
export function formatOriginal(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency as CurrencyCode] ?? currency;
  // Monedas de gran denominación: sin decimales
  const noDecimals = ['ARS', 'CLP', 'COP'].includes(currency);
  if (noDecimals) {
    return `${symbol} ${Math.round(amount).toLocaleString('en-US')}`;
  }
  return `${symbol} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Formatea un monto en USD con separador de miles.
 * Ej: formatUSD(1114.94) => '$ 1,114.94'
 */
export function formatUSD(amount: number): string {
  return `$ ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
