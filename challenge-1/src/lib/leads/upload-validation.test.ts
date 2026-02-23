import { describe, expect, it } from 'vitest'

import { getUploadMaxBytes, validateUploadFile } from './upload-validation'

function createFile(name: string, type: string, sizeInBytes: number): File {
  const content = new Uint8Array(sizeInBytes)
  return new File([content], name, { type })
}

describe('validateUploadFile', () => {
  it('accepts valid pdf file', () => {
    const file = createFile('project-lead.pdf', 'application/pdf', 1024)
    const result = validateUploadFile(file)

    expect(result.isValid).toBe(true)
    expect(result.normalizedMimeType).toBe('application/pdf')
    expect(result.errors).toEqual([])
  })

  it('rejects unsupported file type', () => {
    const file = createFile('project-lead.txt', 'text/plain', 512)
    const result = validateUploadFile(file)

    expect(result.isValid).toBe(false)
    expect(result.errors).toContain(
      'Unsupported file type. Allowed: PDF, PNG, JPG, JPEG.',
    )
  })

  it('rejects file above size limit', () => {
    const file = createFile(
      'project-lead.pdf',
      'application/pdf',
      getUploadMaxBytes() + 1,
    )
    const result = validateUploadFile(file)

    expect(result.isValid).toBe(false)
    expect(result.errors.some((error) => error.includes('File exceeds max size'))).toBe(
      true,
    )
  })
})
