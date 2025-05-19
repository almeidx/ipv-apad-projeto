import { MongoClient } from "mongodb";
import { Faker, fakerPT_PT as faker, pt_PT } from "@faker-js/faker";

const client = new MongoClient("mongodb://localhost:27017");

await client.connect();

const db = client.db("golden_crust");

await db.collection("orders").drop();

const ordersCollection = db.collection("orders");

const ORDERS_COUNT = 123_456;
const CUSTOMERS_COUNT = 10_000;
const ITEMS_COUNT = 300_000;

// Only using this for the data that should be the same between databases.
const seededFaker = new Faker({
	seed: 123,
	locale: pt_PT,
});

const seenEmails = new Set<string>();

const customers = faker.helpers.multiple(() => {
	let email = seededFaker.internet.email();
	while (seenEmails.has(email)) {
		email = seededFaker.internet.email();
	}
	seenEmails.add(email);

	return {
		nif: seededFaker.number.int({ min: 100_000_000, max: 999_999_999 }),
		name: seededFaker.person.fullName(),
		email,
	};
}, { count: CUSTOMERS_COUNT });

seenEmails.clear();

const usedSkus = new Set<string>();

const items = faker.helpers.multiple(() => {
	let sku: string;
	do {
		sku = seededFaker.string.alphanumeric({ length: 6, casing: "upper" });
	} while (usedSkus.has(sku));
	usedSkus.add(sku);

	return {
		sku,
		name: seededFaker.commerce.productName(),
		price: Number.parseFloat(seededFaker.commerce.price({ min: 1, max: 100, dec: 2 })),
		material: seededFaker.commerce.productMaterial(),
	};
}, { count: ITEMS_COUNT });

usedSkus.clear();

const documentTypes = [
	"fatura",
	"recibo",
	"fatura_simplificada",
];

const BATCH_SIZE = 1000;

for (let i = 0; i < ORDERS_COUNT; i += BATCH_SIZE) {
	const orders: {
		order_id: string;
		customer: {
			nif: number;
			name: string;
			email: string;
		};
		items: {
			product: {
				sku: string;
				name: string;
				price: number;
			};
			qty: number;
		}[];
		total: number;
		date: string;
		document_type: string;
	}[] = [];

	for (let j = 0; j < BATCH_SIZE; j++) {
		const orderItems = faker.helpers.multiple(() => ({
			product: faker.helpers.arrayElement(items),
			qty: faker.number.int({ min: 1, max: 10 }),
		}), { count: faker.number.int({ min: 1, max: 10 }) });

		const order = {
			order_id: faker.string.uuid(),
			customer: faker.helpers.arrayElement(customers),
			items: orderItems,
			total: orderItems.reduce((acc, item) => acc + item.product.price * item.qty, 0),
			date: faker.date.past().toISOString().split("T")[0],
			document_type: faker.helpers.arrayElement(documentTypes),
		};

		orders.push(order);
	}

	await ordersCollection.insertMany(orders);
}

await client.close();
