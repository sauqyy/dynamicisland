# Accounts, friends and chat (Supabase)

1. Create a project at https://supabase.com (free tier is fine).
2. **SQL editor** → paste and run [`schema.sql`](schema.sql). It creates the tables, the row-level-security
   policies (friends only can message each other or see each other's activity) and enables realtime.
2b. For group chats, also run [`groups.sql`](groups.sql) the same way (after `schema.sql`).
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

## Voice calls (1:1)

Calls are peer to peer (WebRTC) and need no extra setup: the invite/offer/answer messages travel over
Supabase Realtime broadcast, and Google's public STUN servers help friends find each other.
The call button is in a friend's chat header (the friend must be online).

STUN alone fails for roughly 1 in 10 connections (strict NATs). To cover those, add a free TURN relay
(e.g. the Metered or Cloudflare free tier) to `.env.local`:

```
VITE_TURN_URL=turn:your-relay:443?transport=tcp
VITE_TURN_USER=…
VITE_TURN_PASS=…
```

### Group voice chat

Inside a group chat, the headphones button next to Send joins that group's voice chat. At most **6 people**
can be in one group's voice chat at a time. Everyone connects directly to everyone else (no media server),
so audio quality drops past about 4-6 people and that is why the cap is 6. The cap is checked by the apps
themselves through Supabase Realtime presence (`voice-<group id>`); it needs no extra SQL.
