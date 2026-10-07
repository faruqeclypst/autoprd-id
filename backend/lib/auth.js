/**
 * AutoPRD.id — lib/auth.js
 * Auth opsional via Supabase (Google OAuth). MURNI fetch — tanpa dependensi
 * @supabase/supabase-js (versi barunya butuh Node 22+, VPS masih Node 20).
 *
 * Aktif hanya jika SUPABASE_URL + SUPABASE_ANON_KEY diset.
 * Jika tidak diset: authEnabled() = false, semua request jalan sebagai owner 'local'.
 *
 * Frontend mengirim: Authorization: Bearer <supabase access_token>.
 * Verifikasi: GET {SUPABASE_URL}/auth/v1/user dengan apikey + Bearer token user.
 */
'use strict';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'faruq.blogger@gmail.com').trim().toLowerCase();

function authEnabled() {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

// true bila user adalah admin. Mode lokal (tanpa auth) = admin tunggal.
function isAdmin(user) {
  if (!authEnabled()) return true;
  return !!(user && user.email && String(user.email).toLowerCase() === ADMIN_EMAIL);
}

async function verifyToken(token) {
  try {
    const res = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token },
    });
    if (!res.ok) return null;
    const u = await res.json();
    if (!u || !u.id) return null;
    return { id: u.id, email: u.email || '' };
  } catch (_) {
    return null;
  }
}

// Middleware: isi req.user = {id, email} bila token valid; selain itu null. Tidak pernah menolak.
async function authOptional(req, res, next) {
  req.user = null;
  if (authEnabled()) {
    const h = req.headers.authorization || '';
    const m = h.match(/^Bearer\s+(.+)$/i);
    if (m) req.user = await verifyToken(m[1]);
  }
  next();
}

// Wajib login (dipakai nanti untuk endpoint sensitif bila diperlukan).
function requireLogin(req, res, next) {
  if (!authEnabled()) return next(); // mode lokal: bebas
  if (!req.user) return res.status(401).json({ error: 'Silakan login dulu.' });
  next();
}

function ownerOf(req) {
  return req.user ? req.user.id : 'local';
}

module.exports = { authEnabled, authOptional, requireLogin, ownerOf, isAdmin, SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAIL };
