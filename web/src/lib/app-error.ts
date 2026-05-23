export class AppError extends Error {
  readonly status: number
  readonly code: string

  constructor(message: string, options: { status: number; code: string }) {
    super(message)
    this.name = "AppError"
    this.status = options.status
    this.code = options.code
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}
