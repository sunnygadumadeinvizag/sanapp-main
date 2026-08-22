-- CreateTable
CREATE TABLE "AppNotification" (
    "id" TEXT NOT NULL,
    "appClientId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppNotification_username_read_createdAt_idx" ON "AppNotification"("username", "read", "createdAt");

-- CreateIndex
CREATE INDEX "AppNotification_appClientId_username_read_idx" ON "AppNotification"("appClientId", "username", "read");

-- AddForeignKey
ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_appClientId_fkey" FOREIGN KEY ("appClientId") REFERENCES "Application"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;
