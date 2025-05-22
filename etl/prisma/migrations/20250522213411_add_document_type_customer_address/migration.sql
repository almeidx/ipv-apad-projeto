/*
  Warnings:

  - You are about to drop the column `address` on the `d_customers` table. All the data in the column will be lost.
  - You are about to drop the column `city` on the `d_customers` table. All the data in the column will be lost.
  - You are about to drop the column `postal_code` on the `d_customers` table. All the data in the column will be lost.
  - You are about to alter the column `name` on the `d_customers` table. The data in that column could be lost. The data in that column will be cast from `VarChar(128)` to `VarChar(64)`.
  - You are about to alter the column `name` on the `d_products` table. The data in that column could be lost. The data in that column will be cast from `VarChar(128)` to `VarChar(64)`.
  - Added the required column `document_type_id` to the `sales` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "d_customers" DROP COLUMN "address",
DROP COLUMN "city",
DROP COLUMN "postal_code",
ALTER COLUMN "name" SET DATA TYPE VARCHAR(64);

-- AlterTable
ALTER TABLE "d_products" ALTER COLUMN "name" SET DATA TYPE VARCHAR(64);

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "document_type_id" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "d_customer_addresses" (
    "id" SERIAL NOT NULL,
    "address" VARCHAR(128) NOT NULL,
    "city" VARCHAR(32) NOT NULL,
    "postal_code" VARCHAR(8) NOT NULL,
    "customer_nif" INTEGER NOT NULL,

    CONSTRAINT "d_customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "d_document_types" (
    "id" SMALLSERIAL NOT NULL,
    "name" VARCHAR(32) NOT NULL,

    CONSTRAINT "d_document_types_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "d_document_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "d_customer_addresses" ADD CONSTRAINT "d_customer_addresses_customer_nif_fkey" FOREIGN KEY ("customer_nif") REFERENCES "d_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
