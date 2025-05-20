/*
  Warnings:

  - The primary key for the `customers` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `customer_id` on the `orders` table. All the data in the column will be lost.
  - Added the required column `customer_nif` to the `orders` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_customer_id_fkey";

-- DropIndex
DROP INDEX "orders_customer_id_idx";

-- AlterTable
ALTER TABLE "customers" DROP CONSTRAINT "customers_pkey",
DROP COLUMN "id",
ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("nif");

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "customer_id",
ADD COLUMN     "customer_nif" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "orders_customer_nif_idx" ON "orders"("customer_nif");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_nif_fkey" FOREIGN KEY ("customer_nif") REFERENCES "customers"("nif") ON DELETE RESTRICT ON UPDATE CASCADE;
