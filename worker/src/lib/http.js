// =====================================================================
// Helper HTTP: response JSON seragam + CORS
// =====================================================================

export function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function json(data, init = {}, origin) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(origin),
    ...(init.headers || {}),
  };
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function ok(data, origin) {
  return json({ success: true, data }, { status: 200 }, origin);
}

export function created(data, origin) {
  return json({ success: true, data }, { status: 201 }, origin);
}

export function errorResponse(message, status = 400, origin, details) {
  return json({ success: false, error: message, details: details || undefined }, { status }, origin);
}

export class ApiError extends Error {
  constructor(message, status = 400, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Parse JSON body dengan aman, lempar ApiError bila gagal. */
export async function parseJSON(request) {
  try {
    return await request.json();
  } catch (e) {
    throw new ApiError('Body request harus JSON valid', 400);
  }
}

/** Validasi field wajib pada object. */
export function requireFields(obj, fields) {
  const missing = fields.filter((f) => obj[f] === undefined || obj[f] === null || obj[f] === '');
  if (missing.length) {
    throw new ApiError(`Field wajib belum diisi: ${missing.join(', ')}`, 422);
  }
}
