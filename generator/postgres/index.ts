import { type Prisma, PrismaClient } from "./generated/prisma/index.js";
import { fakerPT_PT } from "@faker-js/faker";

const prisma = new PrismaClient();

const ORDER_COUNT = 654_321;
const PRODUCT_COUNT = 123_456;
const CUSTOMER_COUNT = 56_789;
const STORE_COUNT = 4_321;

console.time("deleting old data");

await prisma.order.deleteMany();
await prisma.product.deleteMany();
await prisma.customer.deleteMany();
await prisma.store.deleteMany();

console.timeEnd("deleting old data");

console.time("generating data");

const products: (Prisma.ProductCreateInput & { id: number })[] = [];
for (let id = 1; id <= PRODUCT_COUNT; id++) {
	products.push({
		id,
		name: fakerPT_PT.commerce.productName(),
		price: Number.parseFloat(fakerPT_PT.commerce.price()),
		description: fakerPT_PT.commerce.productDescription(),
		createdAt: fakerPT_PT.date.past(),
	});
}

const seenEmails = new Set<string>();

const customers: (Prisma.CustomerCreateInput & { id: number })[] = [];
for (let id = 1; id <= CUSTOMER_COUNT; id++) {
	let email = fakerPT_PT.internet.email();
	while (seenEmails.has(email)) {
		email = fakerPT_PT.internet.email();
	}
	seenEmails.add(email);

	customers.push({
		id,
		firstName: fakerPT_PT.person.firstName(),
		lastName: fakerPT_PT.person.lastName(),
		email,
		address: fakerPT_PT.location.streetAddress(),
		city: fakerPT_PT.location.city(),
		postalCode: fakerPT_PT.location.zipCode(),
		phone: fakerPT_PT.phone.number(),
	});
}

const stores: (Prisma.StoreCreateInput & { id: number })[] = [];
for (let id = 1; id <= STORE_COUNT; id++) {
	stores.push({
		id,
		name: fakerPT_PT.company.name(),
		address: fakerPT_PT.location.streetAddress(),
		city: fakerPT_PT.location.city(),
		postalCode: fakerPT_PT.location.zipCode(),
	});
}

const orders: Prisma.OrderUncheckedCreateInput[] = [];
for (let id = 1; id <= ORDER_COUNT; id++) {
	orders.push({
		id,
		customerId: fakerPT_PT.helpers.arrayElement(customers).id,
		storeId: fakerPT_PT.helpers.arrayElement(stores).id,
		total: Number.parseFloat(fakerPT_PT.commerce.price()),
		createdAt: fakerPT_PT.date.past(),

		items: {
			createMany: {
				data: Array.from(
					{ length: fakerPT_PT.number.int({ min: 1, max: 10 }) },
					() => ({
						productId: fakerPT_PT.helpers.arrayElement(products).id,
						quantity: fakerPT_PT.number.int({ min: 1, max: 5 }),
						price: Number.parseFloat(fakerPT_PT.commerce.price()),
						createdAt: fakerPT_PT.date.past(),
					}),
				),
			},
		},
	});
}

console.timeEnd("generating data");

console.time("seed:products");
await prisma.product.createMany({ data: products });
console.timeEnd("seed:products");

console.time("seed:customers");
await prisma.customer.createMany({ data: customers });
console.timeEnd("seed:customers");

console.time("seed:stores");
await prisma.store.createMany({ data: stores });
console.timeEnd("seed:stores");

console.time("seed:orders");
await prisma.order.createMany({ data: orders });
console.timeEnd("seed:orders");

await prisma.$disconnect();
