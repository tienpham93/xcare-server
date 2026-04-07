/*
  Warnings:

  - The primary key for the `knowledge_embeddings` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `knowledge_embeddings` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateExtension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- AlterTable
ALTER TABLE "knowledge_embeddings" DROP CONSTRAINT "knowledge_embeddings_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD CONSTRAINT "knowledge_embeddings_pkey" PRIMARY KEY ("id");
