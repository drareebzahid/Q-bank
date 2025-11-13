// pages/api/questions/index.ts   (temporary debugging endpoint)
// DEBUGGING ONLY: returns non-sensitive diagnostics about the incoming request,
// token verification, access_grants lookup, and question_versions lookup.
// Remove this file or revert it after debugging.

import type { NextApiRequest, NextApiResponse } from 'next';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment');
}

function jsonHeader(apikey: string, token?: string) {
  const headers: Record<string,string> = {
    'apikey': apikey,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const authHeader = (req.headers.authorization || '').trim();
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    const token_prefix = token ? token.slice(0, 8) : null; // do not expose full token

    // Step A: verify token via auth/v1/user
    let authStatus = null, authJson = null;
    if (token) {
      const authResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'GET',
        headers: jsonHeader(SUPABASE_ANON_KEY, token),
      });
      authStatus = authResp.status;
      try { authJson = await authResp.json(); } catch (e) { authJson = String(e); }
    }

    // Step B: check access_grants via REST with the same token
    let grantsStatus = null, grantsJson = null;
    if (authJson && authJson.id) {
      const uid = authJson.id;
      const grantsUrl = `${SUPABASE_URL}/rest/v1/access_grants?user_id=eq.${uid}&active=eq.true`;
      const grantsResp = await fetch(grantsUrl, {
        method: 'GET',
        headers: jsonHeader(SUPABASE_ANON_KEY, token || undefined),
      });
      grantsStatus = grantsResp.status;
      try { grantsJson = await grantsResp.json(); } catch (e) { grantsJson = String(e); }
    }

    // Step C: fetch published question_versions (small sample)
    let qvStatus = null, qvJson = null;
    try {
      const qvUrl = `${SUPABASE_URL}/rest/v1/question_versions?is_published=eq.true&order=published_at.desc&select=id,title,is_published,published_at&limit=5`;
      const qvResp = await fetch(qvUrl, {
        method: 'GET',
        headers: jsonHeader(SUPABASE_ANON_KEY, token || undefined),
      });
      qvStatus = qvResp.status;
      try { qvJson = await qvResp.json(); } catch (e) { qvJson = String(e); }
    } catch (e) {
      qvStatus = 'fetch_failed';
      qvJson = String(e);
    }

    // Build compact diagnostic response (no secret values)
    const diag = {
      token_present: !!token,
      token_prefix,
      auth_status: authStatus,
      auth_user_id: authJson && authJson.id ? authJson.id : null,
      auth_keys: authJson && typeof authJson === 'object' ? Object.keys(authJson).slice(0,10) : null,
      grants_status: grantsStatus,
      grants_count: Array.isArray(grantsJson) ? grantsJson.length : (grantsJson ? 1 : 0),
      grants_sample: Array.isArray(grantsJson) ? grantsJson.map(g => ({ product_id: g.product_id, active: g.active })).slice(0,3) : null,
      qv_status: qvStatus,
      qv_count: Array.isArray(qvJson) ? qvJson.length : null,
      qv_sample: Array.isArray(qvJson) ? qvJson : null
    };

    return res.status(200).json({ debug: diag });
  } catch (err: any) {
    console.error('debug endpoint error', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
