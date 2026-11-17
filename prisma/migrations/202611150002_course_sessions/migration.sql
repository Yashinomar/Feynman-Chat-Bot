ALTER TABLE "Session" ADD COLUMN "courseCheckpointKey" TEXT;
ALTER TABLE "Session" ADD COLUMN "courseContext" TEXT;
CREATE UNIQUE INDEX "Session_userId_courseCheckpointKey_key" ON "Session"("userId", "courseCheckpointKey");
