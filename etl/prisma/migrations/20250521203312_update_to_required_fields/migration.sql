/*
  Warnings:

  - You are about to alter the column `name` on the `d_stores` table. The data in that column could be lost. The data in that column will be cast from `VarChar(128)` to `VarChar(64)`.
  - Made the column `nif` on table `d_customers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `email` on table `d_customers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `name` on table `d_stores` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "d_customers" ALTER COLUMN "nif" SET NOT NULL,
ALTER COLUMN "email" SET NOT NULL,
ALTER COLUMN "email" SET DATA TYPE VARCHAR(320);

-- AlterTable
ALTER TABLE "d_stores" ALTER COLUMN "name" SET NOT NULL,
ALTER COLUMN "name" SET DATA TYPE VARCHAR(64);
