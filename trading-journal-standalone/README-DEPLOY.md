# Deploy: Real Contact form + Admin user details (location, logins)

Two things from your last message: (1) Contact us now opens an in-app form
instead of handing off to an external email app, and (2) the Admin page
now shows, per registered user, where they signed up from and how often
they're coming back.

Tested end-to-end locally: submitted the contact form both as a logged-out
landing-page visitor and as a logged-in user (email pre-fills), confirmed
validation (bad email / empty message both rejected), confirmed a message
submitted with no email configured still safely lands in the database,
and confirmed the Admin page's new Registered Users table shows real
location + login data (simulated Vercel's own geolocation headers locally
to verify, since those only exist on a real Vercel deployment).

## 1. Files in this zip

```
schema.sql                        (new contact_messages table + new users columns — append only, see step 2)
api/_auth.js                      (adds getRequestGeo — reads Vercel's built-in geo headers)
api/columns.ts                    (contact form endpoint, login/geo tracking, admin_stats extended)
src/components/ContactDialog.tsx  (new — the contact form itself)
src/components/Layout.tsx         (sidebar Contact us now opens the form, not mailto)
src/pages/ui/MarketingChrome.tsx  (landing page header + footer Contact us, same change)
src/pages/Admin.tsx               (new Registered Users table + Contact Messages section)
```

Copy these over the matching paths in your repo the same way as before.
`schema.sql` is append-only again — see step 2 for the exact SQL to run
against your production database rather than diffing the whole file.

## 2. Database migration

Run this once against your production Neon database:

```sql
CREATE TABLE IF NOT EXISTS contact_messages (
  id          SERIAL PRIMARY KEY,
  email       TEXT NOT NULL,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contact_messages_created ON contact_messages (created_at DESC);

ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_country TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_city TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_ip TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
```

Existing accounts (your own, and anyone who signed up before this) will
show "—" for location and 0 logins until they log in again — there's no
way to retroactively know where a past signup came from. New signups, and
anyone who logs in again, start filling in immediately.

## 3. Contact form — does it actually email you?

Yes, but it needs one optional setup step to fully work, and it's designed
so nothing breaks or gets lost either way:

**Right now, with zero setup:** every message submitted through the form
is saved to the database and shows up on your Admin page under "Contact
messages" — you'll see it there even if you skip the rest of this section.

**To also get it delivered to your actual support@pipecho.com inbox:**

1. Create a free account at https://resend.com (100 emails/day, 3,000/month
   free — plenty for a contact form).
2. In Resend, add and verify the **pipecho.com** domain — they'll give you
   a few DNS records (TXT/CNAME) to add wherever pipecho.com's DNS is
   managed. This step is required — Resend can only deliver to
   support@pipecho.com once your domain is verified; without it, emails
   from an unverified sender can only reach the address on your own Resend
   account, not support@pipecho.com.
3. In Resend, copy your API key (starts with `re_`).
4. In Vercel: Project Settings → Environment Variables, add:
   - `RESEND_API_KEY` = `re_xxxxx`
   - `RESEND_FROM` = `PipEcho <contact@pipecho.com>` (any address on the
     verified pipecho.com domain works)
   - `CONTACT_TO_EMAIL` — optional, defaults to `support@pipecho.com`
     already, only set this if you want messages sent somewhere else.
5. Redeploy.

Once that's set, every contact-form submission arrives in your inbox with
**Reply-To set to the sender's own email** — so hitting Reply in Gmail (or
wherever you read support@pipecho.com) goes straight back to them, without
you needing to copy their address out of the message body.

Until you do this setup, the form still works from the visitor's side (they
get a "Message sent" confirmation either way) — you just check the Admin
page instead of your inbox.

## 4. Admin page — what's new

The Admin page now has a **Registered Users** table: email, signup date,
location (city/country — read from Vercel's own request headers, no
third-party IP-lookup service, no extra cost), number of logins, and how
recently they were last active ("3h ago", "2d ago", etc).

One honest limitation, called out directly on the page itself: this tells
you **how often** someone's coming back, not **how long** they stay each
time. True session duration needs real client-side activity tracking,
which is what PostHog (from the last batch of changes) is for — once
you've set up your PostHog account, that's where session length and
engagement depth live. This table complements that rather than
duplicating it: "who, from where, how often" here, "how long, doing what"
there.

## 5. What to check after deploying

- Submit the contact form both logged out (landing page) and logged in
  (sidebar) — confirm you see a "Message sent" confirmation both times.
- Check the Admin page's Contact Messages section — both test submissions
  should show up there immediately, regardless of whether Resend is set up.
- If you did the Resend setup, check that support@pipecho.com actually
  received the test message, and that hitting Reply addresses it back to
  the email you submitted with.
- Log in with a second test account (or just log out and back in) and
  confirm the Registered Users table's login count goes up and "Last
  active" updates.
