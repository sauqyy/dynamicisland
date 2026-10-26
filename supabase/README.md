# Accounts, friends and chat (Supabase)

1. Create a project at https://supabase.com (free tier is fine).
2. **SQL editor** → paste and run [`schema.sql`](schema.sql). It creates the tables, the row-level-security
   policies (friends only can message each other or see each other's activity) and enables realtime.
3. **Authentication → Providers → Email**: for quick testing turn off "Confirm email",
   otherwise new accounts must click the link in their inbox before signing in.
4. **Authentication → Providers → Google**: create an OAuth client in Google Cloud Console
   (type "Web application"), add the callback URL shown by Supabase
   (`https://YOUR-PROJECT.supabase.co/auth/v1/callback`) as an authorised redirect URI,
   then paste the client ID and secret into Supabase.
5. **Authentication → URL Configuration → Redirect URLs**: add `http://127.0.0.1:53682`
   (the app listens there for ~3 minutes while you sign in with Google).
6. Copy `.env.example` to `.env.local` in the project root and fill in the project URL and anon key
   (**Project Settings → API**). Restart `npm run tauri dev` / rebuild so they are picked up.

The anon key is public by design; the policies in `schema.sql` are what protect the data.
