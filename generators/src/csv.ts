import { parse as csvParse } from 'csv-parse/sync';
import { stringify as csvStringify } from 'csv-stringify/sync';
import { readFile, writeFile } from "node:fs/promises";
import productsJson from "./generated/products.json" with { type: "json" };
import customersJson from "./generated/customers.json" with { type: "json" };
import type { ProductsJsonItem, CustomersJsonItem } from "./generate-common-data.ts";
import { fakerPT_PT as faker } from "@faker-js/faker";

interface CsvRecord {
	sale_id: string;
	product_name: string;
	product_qty: string;
	product_unit_price: string;
	sale_date: string;
	customer_name: string;
	customer_email: string;
}

interface EnrichedRecord extends CsvRecord {
	product_sku: string;
	customer_nif: string;
}

const data = await readFile(new URL('../golden_crust.csv', import.meta.url), 'utf8');

const records = csvParse(data, { columns: true, skipEmptyLines: true }) as CsvRecord[];

function enrichData(records: CsvRecord[]): EnrichedRecord[] {
	const products = productsJson as ProductsJsonItem[];
	const customers = customersJson as CustomersJsonItem[];
	const enrichedRecords: EnrichedRecord[] = [];

	for (const record of records) {
		const randomProduct = faker.helpers.arrayElement(products);
		const randomCustomer = faker.helpers.arrayElement(customers);

		const enrichedRecord: EnrichedRecord = {
			...record,
			product_sku: randomProduct.sku,
			customer_nif: randomCustomer.nif.toString(),
		};

		enrichedRecords.push(enrichedRecord);
	}

	return enrichedRecords;
}

console.log(`Found ${records.length} records in the original CSV`);

const enrichedRecords = enrichData(records);

const outputPath = new URL('./generated/golden_crust_enhanced.csv', import.meta.url);
const csvOutput = csvStringify(enrichedRecords, { header: true });

await writeFile(outputPath, csvOutput);

console.log('Done');
