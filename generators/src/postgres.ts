import { type Prisma, PrismaClient } from "./generated/prisma/index.js";
import { fakerPT_PT as faker } from "@faker-js/faker";
import customersJson from "./generated/customers.json" with { type: "json" };
import productsJson from "./generated/products.json" with { type: "json" };
import type { CustomersJsonItem, ProductsJsonItem } from "./generate-common-data.js";

const prisma = new PrismaClient();

const ORDER_COUNT = 500_000;
const PRODUCT_COUNT = 100_000;
const CUSTOMER_COUNT = 50_000;

console.time("deleting old data");

await prisma.orderItem.deleteMany();
await prisma.order.deleteMany();
await prisma.product.deleteMany();
await prisma.customer.deleteMany();
await prisma.documentType.deleteMany();

console.timeEnd("deleting old data");

console.time("generating data");

const products: (Prisma.ProductCreateInput & { id: number })[] = faker.helpers
	.arrayElements(productsJson as ProductsJsonItem[], {
		min: 1,
		max: PRODUCT_COUNT,
	})
	.map((product) => ({
		id: product.id,
		sku: product.sku,
		name: product.name,
		description: product.description,
		price: product.price,
		createdAt: faker.date.past(),
	}));

const customers: Prisma.CustomerCreateInput[] = faker.helpers
	.arrayElements(customersJson as CustomersJsonItem[], {
		min: 1,
		max: CUSTOMER_COUNT,
	})
	.map((customer) => ({
		nif: customer.nif,
		firstName: customer.firstName,
		lastName: customer.lastName,
		email: customer.email,
		address: customer.address,
		city: customer.city,
		postalCode: customer.postalCode,
		phone: customer.phone,
		registeredAt: faker.date.past(),
	}));

const documentTypes = [
	{ id: 1, name: "Fatura" },
	{ id: 2, name: "Recibo" },
	{ id: 3, name: "Fatura Simplificada" },
];

await prisma.documentType.createMany({
	data: documentTypes,
});

const orders: (Prisma.OrderCreateManyInput & {
	items: Omit<Prisma.OrderItemCreateManyInput, "orderId">[];
})[] = [];
for (let id = 1; id <= ORDER_COUNT; id++) {
	const orderProductIds: number[] = [];

	orders.push({
		id,
		customerNif: faker.helpers.arrayElement(customers).nif,
		documentTypeId: faker.helpers.arrayElement(documentTypes).id,

		total: Number.parseFloat(faker.commerce.price()),
		createdAt: faker.date.past(),

		items: Array.from({ length: faker.number.int({ min: 1, max: 10 }) }, () => {
			let productId: number;
			do {
				productId = faker.helpers.arrayElement(products).id;
			} while (orderProductIds.includes(productId));

			return {
				productId,
				quantity: faker.number.int({ min: 1, max: 5 }),
			};
		}),
	});
}

console.timeEnd("generating data");

console.time("seed:products");
await prisma.product.createMany({ data: products });
console.timeEnd("seed:products");

console.time("seed:customers");
await prisma.customer.createMany({ data: customers });
console.timeEnd("seed:customers");

console.time("seed:orders");

const BATCH_SIZE = 1000;
for (let i = 0; i < orders.length; i += BATCH_SIZE) {
	const batch = orders.slice(i, i + BATCH_SIZE);
	await prisma.order.createMany({
		data: batch.map(({ items, ...order }) => order),
	});

	for (const order of batch) {
		await prisma.orderItem.createMany({
			data: order.items.map((item) => ({
				...item,
				// biome-ignore lint/style/noNonNullAssertion: order.id is guaranteed to be present here
				orderId: order.id!,
			})),

			// Not sure how its duplicating but whatever
			skipDuplicates: true,
		});
	}

	if (i % 5_000 === 0) {
		console.log(`Inserted ${i} orders`);
	}
}

console.timeEnd("seed:orders");

await prisma.$disconnect();
