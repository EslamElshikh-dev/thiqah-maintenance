export class AppError extends Error {
  constructor(statusCode, code, message, details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(code, message, details) { return new AppError(400, code, message, details); }
export function unauthorized(message = 'Authentication required') { return new AppError(401, 'UNAUTHORIZED', message); }
export function forbidden(message = 'Forbidden') { return new AppError(403, 'FORBIDDEN', message); }
export function notFound(message = 'Not found') { return new AppError(404, 'NOT_FOUND', message); }
export function conflict(code, message) { return new AppError(409, code, message); }
