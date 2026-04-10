/**
 * tokenGenerator.ts
 * Genera codigos de activacion unicos con prefijo EF (EstimaFacil).
 */

export function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = 'EF';
  for (let i = 0; i < 6; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token; // Ej: EF8X2K4M
}
