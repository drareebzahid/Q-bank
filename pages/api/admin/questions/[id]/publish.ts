// pages/api/admin/questions/[id]/publish.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query; // this is question id
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { versionId } = req.body;
    if (!versionId) return res.status(400).json({ error: 'versionId required' });

    // 1) Mark the version published and set published_at
    const { data: publishRes, error: publishErr } = await supabaseAdmin
      .from('question_versions')
      .update({
        is_published: true,
        published_at: new Date().toISOString(),
      })
      .eq('id', versionId)
      .select('*')
      .single();

    if (publishErr) {
      console.error('publish version error', publishErr);
      throw publishErr;
    }

    // 2) Update question.active_version_id
    const { data: qRes, error: qErr } = await supabaseAdmin
      .from('questions')
      .update({
        active_version_id: versionId,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (qErr) {
      console.error('update question error', qErr);
      throw qErr;
    }

    return res.status(200).json({ publishedVersion: publishRes, question: qRes });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
