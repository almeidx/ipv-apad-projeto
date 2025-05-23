import { Prisma, PrismaClient } from "./generated/prisma/client.js"
import { PrismaClient as PgPrismaClient } from "../../generators/src/generated/prisma/client.js";
import type { MongoOrderDocument } from "../../generators/src/mongo.ts";
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

const documentTypes = {
	1: "Fatura",
	2: "Recibo",
	3: "Fatura Simplificada"
} as const;

try {
	console.log("Starting ETL process...");

	await loadDateDimension();
	await loadDocumentTypeDimension();
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

	for (const record of csvRecords) {
		const date = new Date(record.sale_date);
		const dateKey = getDateKey(date);
		allDates.add(dateKey);
	}

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
		await dataMartClient.date.createMany({
			data: batch,
			skipDuplicates: true,
		});
	}

	console.log(`Loaded ${dates.length} dates into date dimension`);
}

async function loadStoreDimension() {
	const stores = [
		{ id: 1, location: 'Viseu', name: 'Doce Norte' },
		{ id: 2, location: 'Lisboa', name: 'Aroma da Sé' },
		{ id: 3, location: 'Coimbra', name: 'Pastel & Tradição' }
	];

	await dataMartClient.store.createMany({ data: stores });

	console.log(`Loaded ${stores.length} stores into store dimension`);
}

async function loadDocumentTypeDimension() {
	const documentTypes_ = Object.entries(documentTypes).map(([id, name]) => ({
		id: Number(id),
		name
	}));

	await dataMartClient.documentType.createMany({ data: documentTypes_ });

	console.log(`Loaded ${documentTypes_.length} document types into document type dimension`);
}

async function loadCustomers() {
	// First, load customers into the data mart
	const customersByNif = new Map<number, Prisma.CustomerCreateManyInput>();

	const emails = new Set<string>();

	// 1. pg
	{
		const pgCustomers = await pgClient.customer.findMany();
		for (const c of pgCustomers) {
			emails.add(c.email);

			customersByNif.set(c.nif, {
				nif: c.nif,
				name: `${c.firstName} ${c.lastName}`,
				email: c.email,
				phone: c.phone,
				registeredAt: c.registeredAt.toISOString()
			});
		}
	}

	// 2. mongo
	{
		const mongoDb = mongoClient.db("golden_crust");

		const ordersCollection = mongoDb.collection<MongoOrderDocument>("orders");

		const mongoCustomers = await ordersCollection.distinct("customer");

		for (const c of mongoCustomers) {
			if (!customersByNif.has(c.nif)) {
				if (emails.has(c.email)) {
					const [localPart, host] = c.email.split('@');
					c.email = `${localPart}+${Math.floor(Math.random() * 10000)}@${host}`;
				} else {
					emails.add(c.email);
				}

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
				if (emails.has(c.email)) {
					const [localPart, host] = c.email.split('@');
					c.email = `${localPart}+${Math.floor(Math.random() * 10000)}@${host}`;
				} else {
					emails.add(c.email);
				}

				customersByNif.set(c.nif, {
					nif: c.nif,
					name: c.name,
					email: c.email,
				});
			}
		}
	}

	// Create customers first
	const uniqueCustomers = Array.from(customersByNif.values());
	await dataMartClient.customer.createMany({
		data: uniqueCustomers,
		// skipDuplicates: true
	});

	console.log(`Loaded ${uniqueCustomers.length} customers to data mart`);

	// Now handle customer address history
	console.log("Processing customer address history...");

	// Create a map to store addresses by customer NIF
	const addressesByCustomerNif = new Map<number, Array<{
		address: string;
		city: string;
		postalCode: string;
		createdAt: Date;
	}>>();

	// 1. Get address history from Postgres
	const pgAddressHistory = await pgClient.customerAddress.findMany({
		include: {
			customer: true
		}
	});

	for (const addr of pgAddressHistory) {
		if (!addressesByCustomerNif.has(addr.customerNif)) {
			addressesByCustomerNif.set(addr.customerNif, []);
		}

		addressesByCustomerNif.get(addr.customerNif)!.push({
			address: addr.address,
			city: addr.city,
			postalCode: addr.postalCode,
			createdAt: addr.createdAt
		});
	}

	// 2. Get unique addresses from MongoDB orders
	const mongoDb = mongoClient.db("golden_crust");
	const ordersCollection = mongoDb.collection("orders");

	const mongoAddresses = await ordersCollection.aggregate([
		{
			$group: {
				_id: {
					nif: "$customer.nif",
					address: "$customer.address",
					city: "$customer.city",
					postalCode: "$customer.postal_code"
				},
				date: {
					$min: {
						$dateFromString: {
							dateString: "$date",
						},
					},
				},
			}
		}
	]).toArray();

	for (const addr of mongoAddresses) {
		if (!addressesByCustomerNif.has(addr._id.nif)) {
			addressesByCustomerNif.set(addr._id.nif, []);
		}

		// Check if this address already exists for this customer
		const existingAddresses = addressesByCustomerNif.get(addr._id.nif)!;
		const alreadyExists = existingAddresses.some(a =>
			a.address === addr._id.address &&
			a.city === addr._id.city &&
			a.postalCode === addr._id.postalCode
		);

		if (!alreadyExists) {
			existingAddresses.push({
				address: addr._id.address,
				city: addr._id.city,
				postalCode: addr._id.postalCode,
				createdAt: addr.date
			});
		}
	}

	// Sort address histories by creation date
	for (const [nif, addresses] of addressesByCustomerNif.entries()) {
		addresses.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
	}

	// Get customer IDs from the database
	const customerIdsByNif = new Map();
	const customers = await dataMartClient.customer.findMany();
	for (const c of customers) {
		if (c.nif) customerIdsByNif.set(c.nif, c.id);
	}

	// Create customer addresses in batches
	const customerAddresses: Prisma.CustomerAddressCreateManyInput[] = [];

	for (const [nif, addresses] of addressesByCustomerNif.entries()) {
		const customerId = customerIdsByNif.get(nif);
		if (!customerId) {
			console.warn(`Cannot find customer ID for NIF ${nif}, skipping addresses`);
			process.exit(1);
		}

		for (const addr of addresses) {
			customerAddresses.push({
				customerId,
				address: addr.address,
				city: addr.city,
				postalCode: addr.postalCode,
				createdAt: addr.createdAt.toISOString(), // Idk why but it's not accepting a date instance
			});
		}
	}

	// Insert customer addresses in batches
	const ADDRESS_BATCH_SIZE = 1000;
	for (let i = 0; i < customerAddresses.length; i += ADDRESS_BATCH_SIZE) {
		const batch = customerAddresses.slice(i, i + ADDRESS_BATCH_SIZE);
		await dataMartClient.customerAddress.createMany({
			data: batch,
			// skipDuplicates: true
		});
		console.log(`Loaded batch ${i / ADDRESS_BATCH_SIZE + 1} of customer addresses (${batch.length} records)`);
	}

	console.log(`Loaded ${customerAddresses.length} customer addresses to data mart`);
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

	const customerMap = new Map<number, number>();
	for (const { nif, id } of await dataMartClient.customer.findMany({ select: { nif: true, id: true } })) {
		customerMap.set(nif, id);
	}

	const productMap = new Map<string, number>();
	for (const { sku, id } of await dataMartClient.product.findMany({ select: { sku: true, id: true } })) {
		productMap.set(sku, id);
	}

	const PG_STORE_ID = 1;
	const MONGO_STORE_ID = 2;
	const CSV_STORE_ID = 3;

	const pgOrders = [];
	try {
		const FETCH_BATCH_SIZE = 1000;
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
	const mongoOrders = await ordersCollection.find().toArray();

	const csvSales = csvRecords;

	const pgSalesData: Prisma.SaleCreateManyInput[] = [];

	for (const order of pgOrders) {
		for (const item of order.items) {
			const saleDate = order.createdAt;
			const dateKey = `${saleDate.getFullYear()}-${(saleDate.getMonth() + 1).toString().padStart(2, '0')}-${saleDate.getDate().toString().padStart(2, '0')}`;
			const dateId = dateMap.get(dateKey);

			if (!dateId) {
				throw new Error(`Date not found for ${dateKey}`);
			}

			const customerId = customerMap.get(order.customerNif);
			if (!customerId) {
				throw new Error(`Customer not found for NIF ${order.customerNif}`);
			}

			const productId = productMap.get(item.product.sku);
			if (!productId) {
				throw new Error(`Product not found for SKU ${item.product.sku}`);
			}

			pgSalesData.push({
				dateId,
				customerId,
				productId,
				storeId: PG_STORE_ID,
				documentTypeId: order.documentTypeId,
				quantity: item.quantity,
				unitPrice: item.product.price,
				totalAmount: item.quantity * item.product.price,
			});
		}
	}

	const mongoSalesData: Prisma.SaleCreateManyInput[] = [];

	for (const order of mongoOrders) {
		const orderDate = new Date(order.date);
		const dateKey = `${orderDate.getFullYear()}-${(orderDate.getMonth() + 1).toString().padStart(2, '0')}-${orderDate.getDate().toString().padStart(2, '0')}`;
		const dateId = dateMap.get(dateKey);

		if (!dateId) {
			throw new Error(`Date not found for ${dateKey}`);
		}

		const customerId = customerMap.get(order.customer.nif);
		if (!customerId) {
			throw new Error(`Customer not found for NIF ${order.customer.nif}`);
		}

		for (const item of order.items) {
			const productId = productMap.get(item.product.sku);
			if (!productId) {
				throw new Error(`Product not found for SKU ${item.product.sku}`);
			}

			mongoSalesData.push({
				dateId,
				customerId,
				productId,
				storeId: MONGO_STORE_ID,
				documentTypeId: convertMongoDocumentTypeToId(order.document_type),
				quantity: item.qty,
				unitPrice: item.product.price,
				totalAmount: item.qty * item.product.price
			});
		}
	}

	function convertMongoDocumentTypeToId(documentType: string): number {
		switch (documentType) {
			case "fatura":
				return 1;
			case "recibo":
				return 2;
			case "fatura_simplificada":
				return 3;
			default:
				throw new Error(`Unknown document type: ${documentType}`);
		}
	}

	const csvSalesData: Prisma.SaleCreateManyInput[] = [];

	for (const record of csvSales) {
		const saleDate = new Date(record.sale_date);
		const dateKey = `${saleDate.getFullYear()}-${(saleDate.getMonth() + 1).toString().padStart(2, '0')}-${saleDate.getDate().toString().padStart(2, '0')}`;
		const dateId = dateMap.get(dateKey);

		if (!dateId) {
			throw new Error(`Date not found for ${dateKey}`);
		}

		const customerId = customerMap.get(Number.parseInt(record.customer_nif, 10));
		if (!customerId) {
			throw new Error(`Customer not found for NIF ${record.customer_nif}`);
		}

		const productId = productMap.get(record.product_sku);
		if (!productId) {
			throw new Error(`Product not found for SKU ${record.product_sku}`);
		}

		const productUnitPrice = Number.parseFloat(record.product_unit_price);

		csvSalesData.push({
			dateId,
			customerId,
			productId,
			storeId: CSV_STORE_ID,
			documentTypeId: 2, // Assuming all csv records are receipts only
			quantity: Number.parseInt(record.product_qty),
			unitPrice: productUnitPrice,
			totalAmount: Number.parseInt(record.product_qty) * productUnitPrice
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
