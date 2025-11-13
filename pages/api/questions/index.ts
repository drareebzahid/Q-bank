// pages/api/questions/index.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const anon = process.env.SUPABASE_ANON_KEY!;

if (!url || !anon) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Expect a Supabase access token in Authorization header: "Bearer <token>"
    const authHeader = (req.headers.authorization || '').trim();
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!token) return res.status(401).json({ error: 'Missing auth token' });

    // Create a Supabase client scoped to this request and attach the user's JWT so RLS can use auth.uid()
    const supabase = createClient(url, anon, {
      auth: { persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    // Verify token and obtain user
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) return res.status(401).json({ error: 'Invalid token' });

    const uid = userData.user.id;

    // Confirm active access_grant exists (this SELECT will run with the user's JWT, so RLS will apply correctly)
    const { data: grants, error: gErr } = await supabase
      .from('access_grants')
      .select('*')
      .eq('user_id', uid)
      .eq('active', true);

    if (gErr) {
      console.error('access_grants query error', gErr);
      throw gErr;
    }

    if (!grants || grants.length === 0) {
      return res.status(403).json({ error: 'No active access' });
    }

    // Pagination params
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = 20;
    const offset = (page - 1) * limit;

    // Return published question versions (RLS + the user's grant now allow access)
    const { data: qvs, error: qvErr } = await supabase
      .from('question_versions')
      .select('*')
      .eq('is_published', true)
      .order('published_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (qvErr) {
      console.error('question_versions query error', qvErr);
      throw qvErr;
    }

    return res.status(200).json({ questions: qvs });
  } catch (err: any) {
    console.error('student endpoint error', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
