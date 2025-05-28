-- AlterTable
ALTER TABLE "sales" ALTER COLUMN "document_num" DROP DEFAULT;
DROP SEQUENCE "sales_document_num_seq";
