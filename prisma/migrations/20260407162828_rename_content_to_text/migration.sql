/*
  Warnings:

  - You are about to drop the column `content` on the `knowledge_embeddings` table. All the data in the column will be lost.
  - Added the required column `text` to the `knowledge_embeddings` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "knowledge_embeddings_embedding_idx";

-- AlterTable
ALTER TABLE "knowledge_embeddings" DROP COLUMN "content",
ADD COLUMN     "text" TEXT NOT NULL;
