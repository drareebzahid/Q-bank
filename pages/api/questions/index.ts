// pages/api/questions/index.ts
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
    // Expect Authorization: Bearer <token>
    const authHeader = (req.headers.authorization || '').trim();
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    if (!token) return res.status(401).json({ error: 'Missing auth token' });

    // 1) verify token and get user via Supabase Auth REST
    const authResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: jsonHeader(SUPABASE_ANON_KEY, token),
    });

    if (!authResp.ok) {
      const err = await authResp.text();
      console.error('Auth verification failed', authResp.status, err);
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = await authResp.json();
    const uid = user?.id;
    if (!uid) {
      console.error('Auth response missing id', user);
      return res.status(401).json({ error: 'Invalid token' });
    }

    // 2) check active access_grants for this user via REST (RLS will evaluate using Bearer token)
    const grantsUrl = `${SUPABASE_URL}/rest/v1/access_grants?user_id=eq.${uid}&active=eq.true`;
    const grantsResp = await fetch(grantsUrl, {
      method: 'GET',
      headers: jsonHeader(SUPABASE_ANON_KEY, token),
    });

    if (!grantsResp.ok) {
      const err = await grantsResp.text();
      console.error('access_grants fetch failed', grantsResp.status, err);
      return res.status(500).json({ error: 'access_grants_query_failed' });
    }

    const grants = await grantsResp.json();
    if (!Array.isArray(grants) || grants.length === 0) {
      return res.status(403).json({ error: 'No active access' });
    }

    // 3) fetch published question_versions (limit and paging)
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = 20;
    const offset = (page - 1) * limit;
    // Supabase REST uses Range header or range query. We'll use limit & offset via query params (range not necessary).
    const qvUrl = `${SUPABASE_URL}/rest/v1/question_versions?is_published=eq.true&order=published_at.desc&select=*`;
    const qvResp = await fetch(qvUrl + `&limit=${limit}&offset=${offset}`, {
      method: 'GET',
      headers: jsonHeader(SUPABASE_ANON_KEY, token),
    });

    if (!qvResp.ok) {
      const err = await qvResp.text();
      console.error('question_versions fetch failed', qvResp.status, err);
      return res.status(500).json({ error: 'question_versions_query_failed' });
    }

    const qvs = await qvResp.json();
    return res.status(200).json({ questions: qvs });
  } catch (err: any) {
    console.error('student endpoint error', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
