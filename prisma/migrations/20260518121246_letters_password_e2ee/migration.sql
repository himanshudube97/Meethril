ALTER TABLE "letter_deliveries" DROP COLUMN "tlockedKey";
DELETE FROM "letter_deliveries"; -- empty pre-prod table
ALTER TABLE "letter_deliveries" ADD COLUMN "salt" TEXT NOT NULL;
ALTER TABLE "letter_deliveries" ADD COLUMN "question" TEXT NOT NULL;
