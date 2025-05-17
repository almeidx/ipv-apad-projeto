import { type Prisma, PrismaClient } from "./generated/prisma/index.js";
import { fakerPT_PT as faker } from "@faker-js/faker";

const prisma = new PrismaClient();

const ORDER_COUNT = 500_000;
const PRODUCT_COUNT = 100_000;
const CUSTOMER_COUNT = 50_000;

console.time("deleting old data");

await prisma.order.deleteMany();
await prisma.product.deleteMany();
await prisma.customer.deleteMany();
await prisma.documentType.deleteMany();

console.timeEnd("deleting old data");

console.time("generating data");

const usedSkus = new Set<string>();

const products: (Prisma.ProductCreateInput & { id: number })[] = [];
for (let id = 1; id <= PRODUCT_COUNT; id++) {
	let sku: string;
	do {
		sku = faker.string.alphanumeric(5);
	} while (usedSkus.has(sku));
	usedSkus.add(sku);

	products.push({
		id,
		name: faker.commerce.productName(),
		sku,
		price: Number.parseFloat(faker.commerce.price({ min: 1, max: 100, dec: 2 })),
		description: faker.commerce.productDescription(),
		createdAt: faker.date.past(),
	});
}

usedSkus.clear();

const seenEmails = new Set<string>();

const customers: (Prisma.CustomerCreateInput & { id: number })[] = [];
for (let id = 1; id <= CUSTOMER_COUNT; id++) {
	let email = faker.internet.email();
	while (seenEmails.has(email)) {
		email = faker.internet.email();
	}
	seenEmails.add(email);

	customers.push({
		id,
		firstName: faker.person.firstName(),
		lastName: faker.person.lastName(),
		nif: faker.number.int({ min: 100_000_000, max: 999_999_999 }),
		email,
		address: faker.location.streetAddress(),
		city: faker.location.city(),
		postalCode: faker.location.zipCode(),
		phone: faker.phone.number(),
	});
}

seenEmails.clear();

const documentTypes = [
	{ id: 1, name: "Fatura" },
	{ id: 2, name: "Recibo" },
	{ id: 3, name: "Fatura Simplificada" },
];

await prisma.documentType.createMany({
	data: documentTypes,
});

const orders: (Prisma.OrderCreateManyInput & {
	items: any[];
})[] = [];
for (let id = 1; id <= ORDER_COUNT; id++) {
	orders.push({
		id,
		customerId: faker.helpers.arrayElement(customers).id,
		documentTypeId: faker.helpers.arrayElement(documentTypes).id,

		total: Number.parseFloat(faker.commerce.price()),
		createdAt: faker.date.past(),

		items: Array.from(
			{ length: faker.number.int({ min: 1, max: 10 }) },
			() => ({
				productId: faker.helpers.arrayElement(products).id,
				quantity: faker.number.int({ min: 1, max: 5 }),
				price: Number.parseFloat(faker.commerce.price()),
				createdAt: faker.date.past(),
			}),
		),
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
	await prisma.order.createMany({ data: batch.map(({ items, ...order }) => order) });

	for (const order of batch) {
		await prisma.orderItem.createMany({
			data: order.items.map((item) => ({
				...item,
				orderId: order.id,
			})),
		});
	}
}

console.timeEnd("seed:orders");

await prisma.$disconnect();
