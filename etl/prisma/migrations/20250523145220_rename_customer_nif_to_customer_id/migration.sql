/*
  Warnings:

  - You are about to drop the column `customer_nif` on the `d_customer_addresses` table. All the data in the column will be lost.
  - Added the required column `customer_id` to the `d_customer_addresses` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "d_customer_addresses" DROP CONSTRAINT "d_customer_addresses_customer_nif_fkey";

-- AlterTable
ALTER TABLE "d_customer_addresses" DROP COLUMN "customer_nif",
ADD COLUMN     "customer_id" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "d_customer_addresses" ADD CONSTRAINT "d_customer_addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "d_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
