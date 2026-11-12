ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "Session" ADD COLUMN "googleReauthenticatedAt" TIMESTAMP(3);

CREATE TABLE "AuthIdentity" (
  "provider" VARCHAR(20) NOT NULL,
  "subject" VARCHAR(255) NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("provider", "subject"),
  CONSTRAINT "AuthIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AuthIdentity_userId_provider_key" ON "AuthIdentity"("userId", "provider");

CREATE TABLE "GoogleAuthRequest" (
  "stateHash" TEXT NOT NULL,
  "codeVerifier" VARCHAR(128) NOT NULL,
  "nonce" VARCHAR(128) NOT NULL,
  "locale" VARCHAR(2) NOT NULL,
  "returnTo" VARCHAR(512) NOT NULL,
  "intent" VARCHAR(20) NOT NULL,
  "sessionId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GoogleAuthRequest_pkey" PRIMARY KEY ("stateHash")
);
CREATE INDEX "GoogleAuthRequest_expiresAt_idx" ON "GoogleAuthRequest"("expiresAt");
