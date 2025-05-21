import { PrismaClient } from "./generated/prisma/client.js"
import { PrismaClient as PgPrismaClient } from "../../generators/src/generated/prisma/client.js";
import { MongoClient } from "mongodb";
import assert from "node:assert";
import { parse } from "csv-parse/sync";
import { readFile } from "node:fs/promises";

assert(process.env.DATA_MART_POSTGRES_URI);
assert(process.env.MONGODB_URI);

const dataMartClient = new PrismaClient();
const pgClient = new PgPrismaClient();
const mongoClient = new MongoClient(process.env.MONGODB_URI);

interface CsvRecord {
	sale_id: string;
	product_name: string;
	product_qty: string;
	product_unit_price: string;
	sale_date: string;
	customer_name: string;
	customer_email: string;
	customer_nif: string;
	product_sku: string;
}

const csvData = await readFile(new URL('../../generators/src/generated/golden_crust_enhanced.csv', import.meta.url), 'utf8');
const csvRecords: CsvRecord[] = parse(csvData, { columns: true, skipEmptyLines: true });

try {
	console.log("Starting ETL process...");

	await loadDateDimension();
	await loadStoreDimension();
	await loadCustomers();
	await loadProducts();
	await loadSales();

	console.log("ETL process completed successfully");
} catch (error) {
	console.error("ETL process failed:", error);
} finally {
	await mongoClient.close();
	await pgClient.$disconnect();
	await dataMartClient.$disconnect();
}

async function loadDateDimension() {
	const allDates = new Set<string>();

	{
		const pgDates = await pgClient.order.findMany({
			select: { createdAt: true }
		});
		pgDates.forEach(order => {
			const date = order.createdAt;
			const dateKey = getDateKey(date);
			allDates.add(dateKey);
		});
	}

	{
		const mongoDb = mongoClient.db("golden_crust");
		const ordersCollection = mongoDb.collection("orders");
		const mongoDates = await ordersCollection.distinct("date");
		mongoDates.forEach(dateStr => {
			const date = new Date(dateStr);
			const dateKey = getDateKey(date);
			allDates.add(dateKey);
		});
	}

	csvRecords.forEach(record => {
		const date = new Date(record.sale_date);
		const dateKey = getDateKey(date);
		allDates.add(dateKey);
	});

	console.log(`Extracted ${allDates.size} unique dates from all data sources`);

	function getDateKey(date: Date): string {
		return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
	}

	const dates = Array.from(allDates).map(dateKey => {
		const [year, month, day] = dateKey.split('-').map(Number);
		return { year, month, day };
	});

	dates.sort((a, b) => {
		return a.year - b.year || a.month - b.month || a.day - b.day;
	});

	const BATCH_SIZE = 1000;
	for (let i = 0; i < dates.length; i += BATCH_SIZE) {
		const batch = dates.slice(i, i + BATCH_SIZE);
		await dataMartClient.date.createMany({ data: batch });
	}

	console.log(`Loaded ${dates.length} dates into date dimension`);
}

async function loadStoreDimension() {
	const stores = [
		{ id: 1, location: 'Store PG', name: 'Postgres Store' },
		{ id: 2, location: 'Store MONGO', name: 'MongoDB Store' },
		{ id: 3, location: 'Store CSV', name: 'CSV Store' }
	];

	await dataMartClient.store.createMany({ data: stores });

	console.log(`Loaded ${stores.length} stores into store dimension`);
}

async function loadCustomers() {
	const customersByNif = new Map<number, {
		nif: number;
		name: string;
		email: string;
		phone?: string;
		address?: string;
		city?: string;
		postalCode?: string;
	}>();

	// 1. pg
	{
		const pgCustomers = await pgClient.customer.findMany();
		for (const c of pgCustomers) {
			customersByNif.set(c.nif, {
				nif: c.nif,
				name: `${c.firstName} ${c.lastName}`,
				email: c.email,
				phone: c.phone,
				address: c.address,
				city: c.city,
				postalCode: c.postalCode
			});
		}
	}

	// 2. mongo
	{
		const mongoDb = mongoClient.db("golden_crust");
		const ordersCollection = mongoDb.collection("orders");
		const mongoCustomers = await ordersCollection.distinct("customer");

		for (const c of mongoCustomers) {
			if (!customersByNif.has(c.nif)) {
				customersByNif.set(c.nif, {
					nif: c.nif,
					name: c.name,
					email: c.email,
				});
			}
		}
	}

	// 3. csv
	{
		const csvCustomers = csvRecords
			.map(record => ({
				nif: Number.parseInt(record.customer_nif, 10),
				name: record.customer_name,
				email: record.customer_email,
			}));

		for (const c of csvCustomers) {
			if (!customersByNif.has(c.nif)) {
				customersByNif.set(c.nif, c);
			}
		}
	}

	const uniqueCustomers = Array.from(customersByNif.values());

	await dataMartClient.customer.createMany({
		data: uniqueCustomers,
		// skipDuplicates: true
	});

	console.log(`Loaded ${uniqueCustomers.length} customers to data mart`);
}

async function loadProducts() {
	const productsBySku = new Map<string, {
		sku: string;
		name: string;
		description?: string;
		price: number;
		material?: string;
	}>();

	// 1. pg
	{
		const pgProducts = await pgClient.product.findMany();
		for (const p of pgProducts) {
			productsBySku.set(p.sku, {
				sku: p.sku,
				name: p.name,
				description: p.description,
				price: p.price,
			});
		}
	}

	// 2. mongo
	{
		const mongoDb = mongoClient.db("golden_crust");
		const ordersCollection = mongoDb.collection("orders");
		const mongoProducts = await ordersCollection.aggregate([
			{ $unwind: "$items" },
			{ $group: { _id: "$items.product.sku", product: { $first: "$items.product" } } }
		]).toArray();

		for (const p of mongoProducts) {
			if (!productsBySku.has(p.product.sku)) {
				productsBySku.set(p.product.sku, {
					sku: p.product.sku,
					name: p.product.name,
					price: p.product.price,
					material: p.product.material,
				});
			}
		}
	}

	// 3. csv
	{
		const csvProducts = csvRecords
			.filter(record => record.product_sku)
			.map(record => ({
				sku: record.product_sku,
				name: record.product_name,
				price: Number.parseFloat(record.product_unit_price),
			}));

		for (const p of csvProducts) {
			if (!productsBySku.has(p.sku)) {
				productsBySku.set(p.sku, p);
			}
		}
	}

	const uniqueProducts = Array.from(productsBySku.values());

	await dataMartClient.product.createMany({
		data: uniqueProducts,
		// skipDuplicates: true
	});

	console.log(`Loaded ${uniqueProducts.length} products to data mart`);
}

async function loadSales() {
	const dateMap = new Map();
	const dates = await dataMartClient.date.findMany();
	dates.forEach(d => {
		const key = `${d.year}-${d.month.toString().padStart(2, '0')}-${d.day.toString().padStart(2, '0')}`;
		dateMap.set(key, d.id);
	});

	const customerMap = new Map();
	const customers = await dataMartClient.customer.findMany();
	customers.forEach(c => {
		if (c.nif) customerMap.set(c.nif, c.id);
	});

	const productMap = new Map();
	const products = await dataMartClient.product.findMany();
	products.forEach(p => {
		if (p.sku) productMap.set(p.sku, p.id);
	});

	const PG_STORE_ID = 1;
	const MONGO_STORE_ID = 2;
	const CSV_STORE_ID = 3;

	const pgOrders = [];
	try {
		const FETCH_BATCH_SIZE = 250;
		let skip = 0;
		let batchCount = 0;
		let batch;

		do {
			console.log(`Fetching PostgreSQL orders batch ${++batchCount} (skip: ${skip}, take: ${FETCH_BATCH_SIZE})`);

			try {
				batch = await pgClient.order.findMany({
					skip,
					take: FETCH_BATCH_SIZE,
					include: {
						items: {
							include: {
								product: {
									select: {
										sku: true,
										price: true
									}
								}
							}
						},
						customer: {
							select: {
								nif: true
							}
						}
					}
				});

				pgOrders.push(...batch);
				console.log(`Successfully fetched ${batch.length} orders (total: ${pgOrders.length})`);
			} catch (batchError) {
				console.error(`Error fetching batch ${batchCount}:`, batchError);
				batch = [];
			}

			skip += FETCH_BATCH_SIZE;
		} while (batch.length === FETCH_BATCH_SIZE);

	} catch (error) {
		console.error("Error setting up PostgreSQL orders fetch:", error);
	}

	console.log(`Total PostgreSQL orders fetched: ${pgOrders.length}`);

	const mongoDb = mongoClient.db("golden_crust");
	const ordersCollection = mongoDb.collection("orders");
	const mongoOrders = await ordersCollection.find({}).toArray();

	const csvSales = csvRecords;

	const pgSalesData = [];
	for (const order of pgOrders) {
		for (const item of order.items) {
			const saleDate = order.createdAt;
			const dateKey = `${saleDate.getFullYear()}-${(saleDate.getMonth() + 1).toString().padStart(2, '0')}-${saleDate.getDate().toString().padStart(2, '0')}`;
			const dateId = dateMap.get(dateKey);

			if (!dateId) {
				console.warn(`Date not found for ${dateKey}, skipping sale`);
				continue;
			}

			const customerId = customerMap.get(order.customerNif);
			if (!customerId) {
				console.warn(`Customer not found for NIF ${order.customerNif}, skipping sale`);
				continue;
			}

			const productId = productMap.get(item.product.sku);
			if (!productId) {
				console.warn(`Product not found for SKU ${item.product.sku}, skipping sale`);
				continue;
			}

			pgSalesData.push({
				dateId,
				customerId,
				productId,
				storeId: PG_STORE_ID,
				quantity: item.quantity,
				unitPrice: item.product.price,
				totalAmount: item.quantity * item.product.price
			});
		}
	}

	const mongoSalesData = [];
	for (const order of mongoOrders) {
		const orderDate = new Date(order.date);
		const dateKey = `${orderDate.getFullYear()}-${(orderDate.getMonth() + 1).toString().padStart(2, '0')}-${orderDate.getDate().toString().padStart(2, '0')}`;
		const dateId = dateMap.get(dateKey);

		if (!dateId) {
			console.warn(`Date not found for ${dateKey}, skipping sale`);
			continue;
		}

		const customerId = customerMap.get(order.customer.nif);
		if (!customerId) {
			console.warn(`Customer not found for NIF ${order.customer.nif}, skipping sale`);
			continue;
		}

		for (const item of order.items) {
			const productId = productMap.get(item.product.sku);
			if (!productId) {
				console.warn(`Product not found for SKU ${item.product.sku}, skipping sale`);
				continue;
			}

			mongoSalesData.push({
				dateId,
				customerId,
				productId,
				storeId: MONGO_STORE_ID,
				quantity: item.qty,
				unitPrice: item.product.price,
				totalAmount: item.qty * item.product.price
			});
		}
	}

	const csvSalesData = [];
	for (const record of csvSales) {
		const saleDate = new Date(record.sale_date);
		const dateKey = `${saleDate.getFullYear()}-${(saleDate.getMonth() + 1).toString().padStart(2, '0')}-${saleDate.getDate().toString().padStart(2, '0')}`;
		const dateId = dateMap.get(dateKey);

		if (!dateId) {
			console.warn(`Date not found for ${dateKey}, skipping sale`);
			continue;
		}

		const customerId = customerMap.get(record.customer_nif);
		if (!customerId) {
			console.warn(`Customer not found for NIF ${record.customer_nif}, skipping sale`);
			continue;
		}

		const productId = productMap.get(record.product_sku);
		if (!productId) {
			console.warn(`Product not found for SKU ${record.product_sku}, skipping sale`);
			continue;
		}

		csvSalesData.push({
			dateId,
			customerId,
			productId,
			storeId: CSV_STORE_ID,
			quantity: parseInt(record.product_qty),
			unitPrice: parseFloat(record.product_unit_price),
			totalAmount: parseInt(record.product_qty) * parseFloat(record.product_unit_price)
		});
	}

	const BATCH_SIZE = 5000;

	for (let i = 0; i < pgSalesData.length; i += BATCH_SIZE) {
		const batch = pgSalesData.slice(i, i + BATCH_SIZE);
		await dataMartClient.sale.createMany({
			data: batch,
			// skipDuplicates: true
		});
		console.log(`Loaded batch ${i / BATCH_SIZE + 1} of PostgreSQL sales (${batch.length} records)`);
	}

	for (let i = 0; i < mongoSalesData.length; i += BATCH_SIZE) {
		const batch = mongoSalesData.slice(i, i + BATCH_SIZE);
		await dataMartClient.sale.createMany({
			data: batch,
			// skipDuplicates: true
		});
		console.log(`Loaded batch ${i / BATCH_SIZE + 1} of MongoDB sales (${batch.length} records)`);
	}

	for (let i = 0; i < csvSalesData.length; i += BATCH_SIZE) {
		const batch = csvSalesData.slice(i, i + BATCH_SIZE);
		await dataMartClient.sale.createMany({
			data: batch,
			// skipDuplicates: true
		});
		console.log(`Loaded batch ${i / BATCH_SIZE + 1} of CSV sales (${batch.length} records)`);
	}

	console.log(`Loaded total of ${pgSalesData.length + mongoSalesData.length + csvSalesData.length} sales to data mart`);
}
