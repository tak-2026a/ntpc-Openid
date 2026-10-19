# New Taipei City OpenID grade viewer

This Vercel app verifies New Taipei City Education OpenID on the server, then grants access only to records explicitly assigned to that authenticated account.

## Privacy design

- Never upload the class export, student names, scores, or service keys to GitHub.
- The browser has no direct Supabase data key. Vercel holds the server-only service-role key.
- Every private route requires the random, HTTP-only session cookie created after a verified OpenID assertion.
- A teacher must have an explicit row in `teacher_class_access`; being a New Taipei City teacher alone does not grant roster access.
- The app cleans OpenID callback parameters by redirecting to `/dashboard` after verification.

## One-time Supabase setup

1. Create a private Supabase project.
2. Open **SQL Editor**, paste and run [supabase/schema.sql](supabase/schema.sql).
3. For the seating and attendance pages, also run [supabase/seating.sql](supabase/seating.sql) and [supabase/attendance.sql](supabase/attendance.sql).
4. In Vercel, set the three variables in [.env.example](.env.example). Use the **service_role** key only as a Vercel server environment variable.
5. Deploy, sign in once with OpenID, then use the Supabase Table Editor to find your `app_users` row.
6. Import the roster locally (not from GitHub): `npm install`, set the environment variables, then run `npm run import:roster -- "C:\\path\\to\\export.xls"`.
7. In the SQL Editor, give only the intended teacher access to their classes:

```sql
insert into public.teacher_class_access (user_id, class_id)
select u.id, c.id
from public.app_users u
cross join public.classes c
where u.openid_identity = 'verified OpenID identity from your private app_users table'
  and c.school_year = '115';
```

Restrict that SQL further by grade, class, and subject before running it. Do not grant all classes unless that is genuinely intended.

## OpenID details

- Provider identifier: `https://openid.ntpc.edu.tw/`
- Callback: `APP_BASE_URL/auth/ntpc/callback`
- Assertion validation happens on the server with `relyingParty.verifyAssertion(req, ...)`.
- The roster is never obtained from OpenID; it is imported from the teacher's private export.

## Important

The repository source can remain public only if it contains no real exports, credentials, personal data, or Vercel environment values. Consider making the repository private before adding staff collaborators.
