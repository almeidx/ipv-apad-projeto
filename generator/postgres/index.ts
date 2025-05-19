import { type Prisma, PrismaClient } from "./generated/prisma/index.js";
import { fakerPT_PT as faker, Faker, pt_PT } from "@faker-js/faker";

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

// Only using this for the data that should be the same between databases.
const seededFaker = new Faker({
	seed: 123,
	locale: pt_PT,
});

const usedSkus = new Set<string>();

const products: (Prisma.ProductCreateInput & { id: number })[] = [];
for (let id = 1; id <= PRODUCT_COUNT; id++) {
	let sku: string;
	do {
		sku = seededFaker.string.alphanumeric({ length: 6, casing: "upper" });
	} while (usedSkus.has(sku));
	usedSkus.add(sku);

	products.push({
		id,
		name: seededFaker.commerce.productName(),
		sku,
		price: Number.parseFloat(seededFaker.commerce.price({ min: 1, max: 100, dec: 2 })),
		description: seededFaker.commerce.productDescription(),
		createdAt: seededFaker.date.past(),
	});
}

usedSkus.clear();

const seenEmails = new Set<string>();

const customers: Prisma.CustomerCreateInput[] = [];
for (let i = 1; i <= CUSTOMER_COUNT; i++) {
	let email = seededFaker.internet.email();
	while (seenEmails.has(email)) {
		email = seededFaker.internet.email();
	}
	seenEmails.add(email);

	customers.push({
		nif: seededFaker.number.int({ min: 100_000_000, max: 999_999_999 }),
		firstName: seededFaker.person.firstName(),
		lastName: seededFaker.person.lastName(),
		email,
		address: seededFaker.location.streetAddress(),
		city: seededFaker.location.city(),
		postalCode: seededFaker.location.zipCode(),
		phone: seededFaker.phone.number(),
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

const orders: (Prisma.OrderCreateManyInput & { items: any[] })[] = [];
for (let id = 1; id <= ORDER_COUNT; id++) {
	orders.push({
		id,
		customerNif: faker.helpers.arrayElement(customers).nif,
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
