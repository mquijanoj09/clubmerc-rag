/**
 * Estimación conservadora de tokens (≈3 caracteres por token en español).
 * Suficiente para aplicar límites sin añadir un tokenizador.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3)
}
