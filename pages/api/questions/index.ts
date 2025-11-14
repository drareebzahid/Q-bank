// pages/api/questions/index.ts
// Student questions endpoint:
// - Reads Supabase JWT from Authorization header
// - Decodes it to get user id (sub)
// - Uses supabaseAdmin (service_role) to:
//   - Check access_grants
//   - Return published question_versions

import type { NextApiRequest, NextApiResponse } from 'next';
import supabaseAdmin from '../../../lib/supabaseAdmin';

// Simple JWT payload decoder (no signature verification), enough to read `sub`
function decodeSupabaseJwt(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(normalized, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = (req.headers.authorization || '').trim();
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : undefined;

  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' });
  }

  try {
    // 1) Decode JWT to get user id
    const payload = decodeSupabaseJwt(token);
    const userId = payload?.sub as string | undefined;

    if (!userId) {
      return res.status(401).json({ error: 'Invalid Supabase JWT: no sub' });
    }

    // 2) Check access_grants via service-role (bypasses RLS, still server-only)
    const { data: grants, error: grantsError } = await supabaseAdmin
      .from('access_grants')
      .select('id, user_id, product_id, active, expires_at')
      .eq('user_id', userId)
      .eq('active', true);

    if (grantsError) {
      console.error('access_grants error', grantsError);
      return res.status(500).json({ error: 'Access lookup failed' });
    }

    if (!grants || grants.length === 0) {
      return res.status(403).json({ error: 'No active access' });
    }

    // 3) Fetch published questions
    const { data: questionVersions, error: qError } = await supabaseAdmin
      .from('question_versions')
      .select(
        'id, question_id, title, content_json, options_json, explanation, published_at'
      )
      .eq('is_published', true)
      .order('published_at', { ascending: false })
      .limit(50);

    if (qError) {
      console.error('question_versions error', qError);
      return res.status(500).json({ error: 'Failed to fetch questions' });
    }

    return res.status(200).json({
      questions: questionVersions || [],
    });
  } catch (err: any) {
    console.error('questions API error', err);
    return res.status(500).json({
      error: 'Internal server error',
      detail: err?.message || String(err),
    });
  }
}
