/*
  Warnings:

  - You are about to drop the column `store_id` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the `stores` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[sku]` on the table `products` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `sku` to the `products` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_store_id_fkey";

-- DropIndex
DROP INDEX "orders_store_id_idx";

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "store_id";

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "sku" TEXT NOT NULL;

-- DropTable
DROP TABLE "stores";

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
