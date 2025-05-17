/*
  Warnings:

  - Added the required column `nif` to the `customers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `document_type_id` to the `orders` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "nif" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "document_type_id" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "document_types" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
