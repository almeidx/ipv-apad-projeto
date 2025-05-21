/*
  Warnings:

  - You are about to drop the `Customer` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Product` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Store` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "sales" DROP CONSTRAINT "sales_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "sales" DROP CONSTRAINT "sales_product_id_fkey";

-- DropForeignKey
ALTER TABLE "sales" DROP CONSTRAINT "sales_store_id_fkey";

-- DropTable
DROP TABLE "Customer";

-- DropTable
DROP TABLE "Product";

-- DropTable
DROP TABLE "Store";

-- CreateTable
CREATE TABLE "d_customers" (
    "id" SERIAL NOT NULL,
    "nif" INTEGER,
    "name" VARCHAR(128) NOT NULL,
    "email" VARCHAR(128),
    "phone" VARCHAR(32),
    "address" VARCHAR(255),
    "city" VARCHAR(64),
    "postal_code" VARCHAR(16),

    CONSTRAINT "d_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "d_stores" (
    "id" SMALLSERIAL NOT NULL,
    "location" VARCHAR(128) NOT NULL,
    "name" VARCHAR(128),

    CONSTRAINT "d_stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "d_products" (
    "id" SERIAL NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "material" VARCHAR(64),

    CONSTRAINT "d_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "d_customers_nif_key" ON "d_customers"("nif");

-- CreateIndex
CREATE UNIQUE INDEX "d_customers_email_key" ON "d_customers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "d_products_sku_key" ON "d_products"("sku");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "d_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "d_stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "d_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
