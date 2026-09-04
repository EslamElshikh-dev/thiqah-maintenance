export function normalizeSaudiPhone(value) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('00966')) digits = digits.slice(2);
  if (/^9665\d{8}$/.test(digits)) digits = `0${digits.slice(3)}`;
  if (/^5\d{8}$/.test(digits)) digits = `0${digits}`;
  return digits;
}

export function assertSaudiMobile(value) {
  const phone = normalizeSaudiPhone(value);
  if (!/^05\d{8}$/.test(phone)) {
    const error = new Error('Invalid Saudi mobile number');
    error.code = 'INVALID_PHONE';
    throw error;
  }
  return phone;
}
