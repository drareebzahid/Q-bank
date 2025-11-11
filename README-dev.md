## Q-Bank Development Setup (Browser-Only Workflow)

1. All code is stored here on GitHub.
2. Environment variables listed in `env.example` will be populated from Supabase and Vercel later.
3. Application stack: Next.js 14 (front-end + API), Prisma (ORM), Supabase (DB + Auth), Vercel (Hosting).
4. Admin panel handles secure CRUD for questions; learner interface runs exam mode.
5. Never commit `.env` files or real credentials to GitHub.
