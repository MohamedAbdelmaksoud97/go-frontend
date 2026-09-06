export const MIN_PASSWORD_LENGTH = 7
export const MAX_PASSWORD_LENGTH = 128

export function passwordLengthError(password: string): string | undefined {
  if (password.length < MIN_PASSWORD_LENGTH) return `كلمة المرور يجب ألا تقل عن ${MIN_PASSWORD_LENGTH} محارف.`
  if (password.length > MAX_PASSWORD_LENGTH) return `كلمة المرور يجب ألا تتجاوز ${MAX_PASSWORD_LENGTH} محرفًا.`
  return undefined
}
