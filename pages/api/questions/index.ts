// pages/api/questions/index.ts
// Student questions endpoint: requires Supabase JWT + active access_grants

import type { NextApiRequest, NextApiResponse } from 'next';

const SUPABASE_URL = process.env.SUPABASE_URL as string;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment');
}

function buildHeaders(apikey: string, token?: string) {
  const headers: Record<string, string> = {
    apikey,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
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
    // Step 1: verify token and get Supabase user
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: buildHeaders(SUPABASE_ANON_KEY, token),
    });

    if (!userResp.ok) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const user = await userResp.json();
    const userId = user?.id as string | undefined;
    if (!userId) {
      return res.status(401).json({ error: 'Invalid Supabase user' });
    }

    // Step 2: check active access_grants for this user
    const grantsResp = await fetch(
      `${SUPABASE_URL}/rest/v1/access_grants?user_id=eq.${userId}&active=eq.true`,
      {
        method: 'GET',
        headers: buildHeaders(SUPABASE_ANON_KEY, token),
      }
    );

    if (!grantsResp.ok) {
      return res
        .status(500)
        .json({ error: 'Access lookup failed at access_grants' });
    }

    const grants = (await grantsResp.json()) as any[];
    if (!Array.isArray(grants) || grants.length === 0) {
      return res.status(403).json({ error: 'No active access' });
    }

    // Step 3: fetch published question_versions for students
    const questionsResp = await fetch(
      `${SUPABASE_URL}/rest/v1/question_versions` +
        `?is_published=eq.true` +
        `&select=id,question_id,title,content_json,options_json,explanation,published_at` +
        `&order=published_at.desc` +
        `&limit=50`,
      {
        method: 'GET',
        headers: buildHeaders(SUPABASE_ANON_KEY),
      }
    );

    if (!questionsResp.ok) {
      return res
        .status(500)
        .json({ error: 'Failed to fetch questions from question_versions' });
    }

    const questionVersions = await questionsResp.json();

    return res.status(200).json({
      questions: questionVersions,
    });
  } catch (err: any) {
    console.error('questions API error', err);
    return res.status(500).json({
      error: 'Internal server error',
      detail: err?.message || String(err),
    });
  }
}
