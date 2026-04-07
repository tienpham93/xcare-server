-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_createdBy_fkey";

-- AlterTable
ALTER TABLE "Ticket" ALTER COLUMN "createdBy" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("username") ON DELETE SET NULL ON UPDATE CASCADE;
