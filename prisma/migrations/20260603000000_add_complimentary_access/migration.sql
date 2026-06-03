-- Additive only: complimentary (friends & family) access flag on users.
-- Default false, so existing rows are unaffected (CLAUDE.md additive-only rule).

-- AlterTable
ALTER TABLE "users" ADD COLUMN "complimentaryAccess" BOOLEAN NOT NULL DEFAULT false;
