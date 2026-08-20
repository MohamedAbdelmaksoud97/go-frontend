export const MIN_PASSWORD_LENGTH = 7

export function passwordLengthError(password: string): string | undefined {
  return password.length < MIN_PASSWORD_LENGTH
    ? `كلمة المرور يجب ألا تقل عن ${MIN_PASSWORD_LENGTH} محارف.`
    : undefined
}
