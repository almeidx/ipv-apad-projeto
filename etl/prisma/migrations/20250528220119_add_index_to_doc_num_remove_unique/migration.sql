-- DropIndex
DROP INDEX "sales_document_num_key";

-- CreateIndex
CREATE INDEX "sales_document_num_idx" ON "sales"("document_num");
