import { MongoClient } from "mongodb";
import { fakerPT_PT as faker } from "@faker-js/faker";
import type { CustomersJsonItem, ProductsJsonItem } from "./generate-common-data.ts";
import customersJson from "./generated/customers.json" with { type: "json" };
import productsJson from "./generated/products.json" with { type: "json" };
import assert from "node:assert";

assert(process.env.MONGODB_URI, "MONGODB_URI must be set");

const client = new MongoClient(process.env.MONGODB_URI);

await client.connect();

const db = client.db("golden_crust");

await db.collection("orders").drop().catch(() => console.log("No orders collection to drop"));

const ordersCollection = db.collection("orders");

const ORDER_COUNT = 150_000;
const CUSTOMER_COUNT = 25_000;
const PRODUCT_COUNT = 25_000;
const MAX_ORDER_ITEM_COUNT = 10;

// Use about 70% of customers from JSON, rest will be random
const jsonCustomersCount = Math.floor(CUSTOMER_COUNT * 0.7);
const jsonCustomers = faker.helpers.arrayElements(customersJson as CustomersJsonItem[], {
	min: 1,
	max: jsonCustomersCount,
});

// Generate random customers for the remaining 30%
const randomCustomersCount = CUSTOMER_COUNT - jsonCustomers.length;
const usedEmails = new Set(jsonCustomers.map(customer => customer.email.toLowerCase()));
const randomCustomers = Array.from({ length: randomCustomersCount }, () => {
	let email: string;
	do {
		email = faker.internet.email().toLowerCase();
	} while (usedEmails.has(email));

	usedEmails.add(email);

	return {
		nif: faker.number.int({ min: 100_000_000, max: 999_999_999 }),
		firstName: faker.person.firstName(),
		lastName: faker.person.lastName(),
		email,
		address: faker.location.streetAddress(),
		city: faker.location.city(),
		postal_code: faker.location.zipCode(),
	};
});

const allCustomerData = [...jsonCustomers, ...randomCustomers];

const customers = allCustomerData.map((customer) => ({
	nif: customer.nif,
	name: `${customer.firstName} ${customer.lastName}`,
	email: customer.email,
	initialAddress: {
		address: customer.address,
		city: customer.city,
		postal_code: 'postal_code' in customer ? customer.postal_code : customer.postalCode ?? faker.location.zipCode(),
	}
}));

const products = faker.helpers
	.arrayElements(productsJson as ProductsJsonItem[], {
		min: 1,
		max: PRODUCT_COUNT,
	})
	.map((product) => ({
		sku: product.sku,
		name: product.name,
		price: product.price,
		material: product.material,
	}));

const documentTypes = [
	"fatura",
	"recibo",
	"fatura_simplificada",
] as const;

const BATCH_SIZE = 1000;

console.time("seed:orders");
for (let i = 0; i < ORDER_COUNT; i += BATCH_SIZE) {
	const orders = [];

	for (let j = 0; j < BATCH_SIZE; j++) {
		const customer = faker.helpers.arrayElement(customers);

		const useNewAddress = faker.number.int({ min: 1, max: 100 }) <= 15;

		const customerAddress = useNewAddress
			? {
				address: faker.location.streetAddress(),
				city: faker.location.city(),
				postal_code: faker.location.zipCode()
			}
			: customer.initialAddress;

		const orderItems = faker.helpers.multiple(() => ({
			product: faker.helpers.arrayElement(products),
			qty: faker.number.int({ min: 1, max: 5 }),
		}), { count: faker.number.int({ min: 1, max: MAX_ORDER_ITEM_COUNT }) });

		const orderDate = faker.date.past();

		const total = orderItems.reduce((acc, item) => acc + item.product.price * item.qty, 0);

		const order = {
			customer: {
				nif: customer.nif,
				name: customer.name,
				email: customer.email,

				address: customerAddress.address,
				city: customerAddress.city,
				postal_code: customerAddress.postal_code
			},
			items: orderItems,
			total,
			date: orderDate.toISOString().split("T")[0],
			document_type: faker.helpers.arrayElement(documentTypes),
		} satisfies MongoOrderDocument;

		orders.push(order);
	}

	await ordersCollection.insertMany(orders);

	console.log(`Inserted ${i + orders.length} orders`);
}

console.timeEnd("seed:orders");

console.time("create:indexes");
await ordersCollection.createIndex({ "customer.nif": 1 });
await ordersCollection.createIndex({ "customer.email": 1 });
await ordersCollection.createIndex({ date: 1 });
console.timeEnd("create:indexes");

await client.close();

export interface MongoOrderDocument {
	customer: {
		nif: number;
		name: string;
		email: string;
		address: string;
		city: string;
		postal_code: string;
	};
	items: {
		product: {
			sku: string;
			name: string;
			price: number;
			material: string;
		};
		qty: number;
	}[];
	total: number;
	/** Only the date part */
	date: string;
	document_type: typeof documentTypes[number];
}
