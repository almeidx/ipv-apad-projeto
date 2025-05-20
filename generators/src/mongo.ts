import { MongoClient } from "mongodb";
import { fakerPT_PT as faker } from "@faker-js/faker";
import type { CustomersJsonItem, ProductsJsonItem } from "./generate-common-data.ts";
import customersJson from "./generated/customers.json" with { type: "json" };
import productsJson from "./generated/products.json" with { type: "json" };

const client = new MongoClient("mongodb://localhost:27017");

await client.connect();

const db = client.db("golden_crust");

await db.collection("orders").drop();

const ordersCollection = db.collection("orders");

const ORDER_COUNT = 150_000;
const CUSTOMER_COUNT = 10_000;
const PRODUCT_COUNT = 25_000;
const MAX_ORDER_ITEM_COUNT = 10;

const customers = faker.helpers
	.arrayElements(customersJson as CustomersJsonItem[], {
		min: 1,
		max: CUSTOMER_COUNT,
	})
	.map((customer) => ({
		nif: customer.nif,
		name: `${customer.firstName} ${customer.lastName}`,
		email: customer.email,
		createdAt: faker.date.past(),
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
];

const BATCH_SIZE = 1000;

for (let i = 0; i < ORDER_COUNT; i += BATCH_SIZE) {
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
			product: faker.helpers.arrayElement(products),
			qty: faker.number.int({ min: 1, max: 5 }),
		}), { count: faker.number.int({ min: 1, max: MAX_ORDER_ITEM_COUNT }) });

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

	console.log(`Inserted ${i + orders.length} orders`);
}

await client.close();
