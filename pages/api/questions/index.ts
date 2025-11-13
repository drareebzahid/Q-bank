// pages/api/questions/index.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const anon = process.env.SUPABASE_ANON_KEY!;

if (!url || !anon) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment');
}

const supabase = createClient(url, anon, { auth: { persistSession: false } });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Accept Supabase session token in Authorization header: "Bearer <token>"
    const authHeader = req.headers.authorization || '';
    const token = authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Missing auth token' });

    // Verify token and obtain user
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) return res.status(401).json({ error: 'Invalid token' });

    const uid = userData.user.id;

    // Confirm active access_grant exists
    const { data: grants, error: gErr } = await supabase
      .from('access_grants')
      .select('*')
      .eq('user_id', uid)
      .eq('active', true);

    if (gErr) throw gErr;
    if (!grants || grants.length === 0) {
      return res.status(403).json({ error: 'No active access' });
    }

    // Pagination params
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = 20;
    const offset = (page - 1) * limit;

    // Return published question versions the RLS will already restrict appropriately;
    // server uses anon key and lets RLS enforce per-user access if called from client.
    const { data: qvs, error: qvErr } = await supabase
      .from('question_versions')
      .select('*')
      .eq('is_published', true)
      .order('published_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (qvErr) throw qvErr;

    return res.status(200).json({ questions: qvs });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
