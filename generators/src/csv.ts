import { parse as csvParse } from 'csv-parse/sync';
import { stringify as csvStringify } from 'csv-stringify/sync';
import { readFile, writeFile } from "node:fs/promises";
import { fakerPT_PT as faker } from "@faker-js/faker";
import { PrismaClient } from "./generated/prisma/client.js";
import { MongoClient } from "mongodb";
import assert from "node:assert";
import type { MongoOrderDocument } from "./mongo.ts";

assert(process.env.MONGODB_URI, "MONGODB_URI must be set");

const data = await readFile(new URL('../golden_crust.csv', import.meta.url), 'utf8');

const records = csvParse(data, { columns: true, skipEmptyLines: true }) as CsvRecord[];

console.log(`Found ${records.length} records in the original CSV`);

const enrichedRecords: EnrichedRecord[] = [];

{
	const productSkus = new Set<string>();
	const customerNifs = new Set<number>();

	{
		const prisma = new PrismaClient();

		const [pgProducts, pgCustomers] = await Promise.all([
			prisma.product.findMany({
				select: { sku: true },
			}),
			prisma.customer.findMany({
				select: { nif: true },
			}),
		]);

		for (const product of pgProducts) {
			productSkus.add(product.sku);
		}
		for (const customer of pgCustomers) {
			customerNifs.add(customer.nif);
		}

		await prisma.$disconnect();
	}

	{
		const client = new MongoClient(process.env.MONGODB_URI);

		await client.connect();

		const db = client.db("golden_crust");

		const [distinctProductSkus, distinctCustomerNifs] = await Promise.all([
			db.collection<MongoOrderDocument>("orders").distinct("items.product.sku"),
			db.collection<MongoOrderDocument>("orders").distinct("customer.nif")
		]);

		for (const sku of distinctProductSkus) {
			productSkus.add(sku);
		}
		for (const nif of distinctCustomerNifs) {
			customerNifs.add(nif);
		}

		await client.close();
	}

	const productSkusArray = Array.from(productSkus);
	const customerNifsArray = Array.from(customerNifs);

	for (const record of records) {
		const enrichedRecord: EnrichedRecord = {
			...record,
			// Scale down price as it's way too high in the original data
			product_unit_price: (Number.parseFloat(record.product_unit_price) / 10).toFixed(2), 
			product_sku: faker.helpers.arrayElement(productSkusArray),
			customer_nif: faker.helpers.arrayElement(customerNifsArray).toString(),
		};

		enrichedRecords.push(enrichedRecord);
	}
}

const outputPath = new URL('./generated/golden_crust_enhanced.csv', import.meta.url);
const csvOutput = csvStringify(enrichedRecords, { header: true });

await writeFile(outputPath, csvOutput);

console.log('Done');

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
