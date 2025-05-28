/*
  Warnings:

  - A unique constraint covering the columns `[document_num]` on the table `sales` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "document_num" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "sales_document_num_key" ON "sales"("document_num");
