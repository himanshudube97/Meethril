# Account Deletion — Operator Runbook

Account deletion is **manual** at current scale. When a user asks to delete their
account, the app records the request in a queue; an operator (you) does the
actual deletion by hand after a 14-day grace window. There is no automated purge
cron and no automated Dodo cancellation — this doc is the manual procedure.

## How a request gets created

1. User goes to `/me` → **delete my account** → types their email to confirm.
2. `POST /api/account/delete-request` writes a row to the
   `account_deletion_requests` table with `purgeOn = now + 14 days` and
   `status = 'pending'`, sends the user a confirmation email, and signs them out.
3. Nothing is deleted yet. The user can email support before `purgeOn` to cancel
   (set that row's `status = 'cancelled'`).

## The queue table

`account_deletion_requests`:

| Column | Meaning |
|---|---|
| `userId` | The user to delete |
| `email` | Snapshot of their email at request time |
| `reason` | Optional "why are you leaving?" text |
| `requestedAt` | When they asked |
| `purgeOn` | Earliest date you may delete (requestedAt + 14d) |
| `status` | `pending` \| `done` \| `cancelled` |

## Processing deletions (do this periodically, e.g. weekly)

### 1. Find what's due

Open Prisma Studio:

```bash
docker compose exec app npx prisma studio   # opens at :5555
```

Look at `account_deletion_requests` for rows where `status = pending` **and**
`purgeOn <= today`. (Skip anything still inside its 14-day window.)

### 2. Cancel their subscription in Dodo (if any)

For each due user, check whether they have a subscription:

- In Studio, open the `users` row → if `dodoSubscriptionId` is set and
  `subscriptionStatus` is `active`/`on_hold`, they have live billing.
- Go to the **Dodo Payments dashboard** → find that subscription (search by the
  user's email or `dodoCustomerId`) → **cancel** it.

> Code does **not** touch Dodo. If you skip this, the card keeps getting charged.

### 3. Delete the user

Deleting the `users` row cascades and removes everything they own — journal
entries, letters, doodles, photos (local `EncryptedBlob` rows), scrapbooks,
stranger notes/threads, push subscriptions, feedback, **and** the
`account_deletion_requests` row itself.

Easiest: in Prisma Studio, open `users`, find the row by email, delete it.

Or from a shell:

```bash
docker compose exec app npx prisma studio   # delete via UI, OR:
# scripted (replace the email):
docker compose exec app node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.delete({where:{email:'user@example.com'}}).then(()=>console.log('deleted')).finally(()=>p.\$disconnect())"
```

> **Photos in production (Supabase Storage):** the cascade removes the DB rows
> but not the storage objects. If `PHOTO_STORAGE=supabase`, also delete the
> user's folder `{userId}/` from the Supabase Storage bucket. (In local/dev mode
> photos live in `EncryptedBlob` and are cascade-deleted — nothing extra to do.)

> **Supabase auth identity (production):** the user still exists in Supabase Auth
> (login is linked by email). Delete them in the Supabase dashboard
> (Authentication → Users → find by email → delete), otherwise they could log in
> again and a fresh empty account would be created.

### 4. Confirm

The user's row and all related rows should be gone. Because the request row
cascades away with the user, there's nothing left to mark `done` — but if you
deleted the user *without* removing the request row (e.g. soft path), set that
row's `status = 'done'`.

## Checklist per user

- [ ] `purgeOn` has passed
- [ ] Dodo subscription cancelled (if any)
- [ ] `users` row deleted (cascades all their data + the request row)
- [ ] (prod) Supabase Storage folder `{userId}/` removed
- [ ] (prod) Supabase Auth user deleted

## If you ever outgrow manual

The full automated design (purge cron, auto Dodo cancel, storage/auth sweep,
restore flow) is specced in
[`docs/superpowers/specs/2026-06-07-account-deletion-design.md`](superpowers/specs/2026-06-07-account-deletion-design.md)
and planned in
[`docs/superpowers/plans/2026-06-07-account-deletion.md`](superpowers/plans/2026-06-07-account-deletion.md).
