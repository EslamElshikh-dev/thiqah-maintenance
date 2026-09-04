function validationError(message, field) {
  const error = new Error(message);
  error.code = 'VALIDATION_ERROR';
  if (field) error.field = field;
  return error;
}

export function requireString(value, field, { min = 1, max = 1000 } = {}) {
  const text = String(value ?? '').trim();
  if (text.length < min || text.length > max) {
    throw validationError(`${field} must be between ${min} and ${max} characters`, field);
  }
  return text;
}

export function optionalString(value, field, { max = 1000 } = {}) {
  if (value === undefined || value === null || value === '') return null;
  return requireString(value, field, { min: 1, max });
}

export function assertEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (!email) return null;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw validationError('Invalid email', 'email');
  }
  return email;
}

export function assertUuid(value, field = 'id') {
  const text = String(value ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text)) {
    throw validationError(`${field} must be a valid UUID`, field);
  }
  return text;
}

export function optionalIsoDate(value, field = 'date') {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw validationError(`${field} must use YYYY-MM-DD`, field);
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw validationError(`${field} is not a valid calendar date`, field);
  }
  return text;
}

export function optionalIsoTimestamp(value, field = 'timestamp') {
  if (value === undefined || value === null || value === '') return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw validationError(`${field} must be a valid ISO timestamp`, field);
  return parsed.toISOString();
}

export function boundedInteger(value, field, { min = 1, max = 100, fallback = min } = {}) {
  const candidate = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isInteger(candidate) || candidate < min || candidate > max) {
    throw validationError(`${field} must be an integer between ${min} and ${max}`, field);
  }
  return candidate;
}
