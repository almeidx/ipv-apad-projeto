/*
  Warnings:

  - You are about to alter the column `store_id` on the `sales` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `SmallInt`.
  - You are about to alter the column `document_type_id` on the `sales` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `SmallInt`.
  - A unique constraint covering the columns `[email]` on the table `d_customers` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "sales" DROP CONSTRAINT "sales_document_type_id_fkey";

-- DropForeignKey
ALTER TABLE "sales" DROP CONSTRAINT "sales_store_id_fkey";

-- AlterTable
ALTER TABLE "d_customers" ADD COLUMN     "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "sales" ALTER COLUMN "store_id" SET DATA TYPE SMALLINT,
ALTER COLUMN "document_type_id" SET DATA TYPE SMALLINT;

-- CreateIndex
CREATE UNIQUE INDEX "d_customers_email_key" ON "d_customers"("email");

-- CreateIndex
CREATE INDEX "d_dates_year_month_idx" ON "d_dates"("year", "month");

-- CreateIndex
CREATE INDEX "d_products_name_idx" ON "d_products"("name");

-- CreateIndex
CREATE INDEX "sales_date_id_idx" ON "sales"("date_id");

-- CreateIndex
CREATE INDEX "sales_customer_id_idx" ON "sales"("customer_id");

-- CreateIndex
CREATE INDEX "sales_store_id_idx" ON "sales"("store_id");

-- CreateIndex
CREATE INDEX "sales_product_id_idx" ON "sales"("product_id");

-- CreateIndex
CREATE INDEX "sales_document_type_id_idx" ON "sales"("document_type_id");

-- CreateIndex
CREATE INDEX "sales_date_id_product_id_idx" ON "sales"("date_id", "product_id");

-- CreateIndex
CREATE INDEX "sales_date_id_store_id_idx" ON "sales"("date_id", "store_id");

-- CreateIndex
CREATE INDEX "sales_date_id_customer_id_idx" ON "sales"("date_id", "customer_id");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "d_stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "d_document_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
