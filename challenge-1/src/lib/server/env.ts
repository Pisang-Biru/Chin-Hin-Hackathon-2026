export function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function getEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}
