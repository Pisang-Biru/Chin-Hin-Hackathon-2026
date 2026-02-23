import { getEnvNumber } from '#/lib/server/env'

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
] as const

const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg'] as const

function inferMimeFromFileName(fileName: string): string | null {
  const lower = fileName.toLowerCase()
  const extension = ALLOWED_EXTENSIONS.find((ext) => lower.endsWith(ext))

  switch (extension) {
    case '.pdf':
      return 'application/pdf'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    default:
      return null
  }
}

export function getUploadMaxMb(): number {
  return getEnvNumber('UPLOAD_MAX_MB', 20)
}

export function getUploadMaxBytes(): number {
  return getUploadMaxMb() * 1024 * 1024
}

export function validateUploadFile(file: File): {
  isValid: boolean
  normalizedMimeType?: string
  errors: string[]
} {
  const errors: string[] = []
  const maxBytes = getUploadMaxBytes()
  const detectedMime = file.type.toLowerCase() || inferMimeFromFileName(file.name)

  if (!detectedMime || !ALLOWED_MIME_TYPES.includes(detectedMime as (typeof ALLOWED_MIME_TYPES)[number])) {
    errors.push('Unsupported file type. Allowed: PDF, PNG, JPG, JPEG.')
  }

  if (file.size <= 0) {
    errors.push('Uploaded file is empty.')
  }

  if (file.size > maxBytes) {
    errors.push(`File exceeds max size of ${getUploadMaxMb()}MB.`)
  }

  return {
    isValid: errors.length === 0,
    normalizedMimeType: detectedMime ?? undefined,
    errors,
  }
}
