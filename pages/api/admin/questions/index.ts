// pages/api/admin/questions/index.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'POST') {
      // Expected body:
      // { slug?, discipline?, difficulty?, title, contentJson, optionsJson?, explanation?, createdById? }
      const body = req.body;

      // Basic validation
      if (!body.title || !body.contentJson) {
        return res.status(400).json({ error: 'Missing title or contentJson' });
      }

      // 1) create question
      const { data: question, error: qErr } = await supabaseAdmin
        .from('questions')
        .insert({
          slug: body.slug || null,
          discipline: body.discipline || null,
          difficulty: body.difficulty || 'MEDIUM',
          created_by: body.createdById || null,
        })
        .select('*')
        .single();

      if (qErr) {
        console.error('create question error', qErr);
        throw qErr;
      }

      // 2) create version
      const { data: version, error: vErr } = await supabaseAdmin
        .from('question_versions')
        .insert({
          question_id: question.id,
          version_number: 1,
          title: body.title,
          content_json: body.contentJson,
          options_json: body.optionsJson || null,
          explanation: body.explanation || null,
          created_by: body.createdById || null,
          is_published: false
        })
        .select('*')
        .single();

      if (vErr) {
        console.error('create version error', vErr);
        throw vErr;
      }

      return res.status(201).json({ question, version });
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
