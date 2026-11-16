-- Existing requests deliberately have no confirmation and cannot link Google.
ALTER TABLE "GoogleAuthRequest" ADD COLUMN "passwordConfirmedAt" TIMESTAMP(3);
