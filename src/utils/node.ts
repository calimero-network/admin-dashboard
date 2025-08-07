export function getNearEnvironment(): string {
  return import.meta.env['VITE_NEAR_ENVIRONMENT'] ?? 'testnet';
}
