const UFS = new Set([
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
]);

/**
 * Número de recibo do CAR: UF-código IBGE do município (7 dígitos)-32 caracteres
 * hexadecimais, que no recibo aparecem agrupados de 4 em 4 com pontos.
 * Retorna o código normalizado (sem pontos, maiúsculo) ou null se inválido.
 */
export function normalizarCar(entrada: string): string | null {
  const limpo = entrada.toUpperCase().replace(/[\s.]/g, '');
  const m = /^([A-Z]{2})-?(\d{7})-?([0-9A-F]{32})$/.exec(limpo);
  if (!m || !UFS.has(m[1]!)) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Formata para leitura: UF-1234567-XXXX.XXXX.… */
export function formatarCar(car: string): string {
  const [uf, mun, hex] = car.split('-');
  if (!hex) return car;
  return `${uf}-${mun}-${hex.match(/.{1,4}/g)!.join('.')}`;
}
