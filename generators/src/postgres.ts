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
await prisma.customerAddress.deleteMany();
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
		createdAt: faker.date.past({ years: 5 }),
	}));

// Use about 70% of customers from JSON, rest will be random
const jsonCustomersCount = Math.floor(CUSTOMER_COUNT * 0.7);
const jsonCustomers = faker.helpers.arrayElements(customersJson as CustomersJsonItem[], {
	min: 1,
	max: jsonCustomersCount,
});

// Generate random customers for the remaining 30%
const randomCustomersCount = CUSTOMER_COUNT - jsonCustomers.length;

const usedEmails = new Set(jsonCustomers.map(customer => customer.email.toLowerCase()));
const usedNifs = new Set(jsonCustomers.map(customer => customer.nif));

const randomCustomers = Array.from({ length: randomCustomersCount }, () => {
	let email: string;
	do {
		email = faker.internet.email().toLowerCase();
	} while (usedEmails.has(email));
	usedEmails.add(email);

	let nif: number;
	do {
		nif = faker.number.int({ min: 100_000_000, max: 999_999_999 });
	} while (usedNifs.has(nif));

	return {
		nif,
		firstName: faker.person.firstName(),
		lastName: faker.person.lastName(),
		email,
		phone: faker.phone.number(),
		address: faker.location.streetAddress(),
		city: faker.location.city(),
		postalCode: faker.location.zipCode(),
	};
});

const allCustomerData = [...jsonCustomers, ...randomCustomers];

const customers: Prisma.CustomerCreateInput[] = allCustomerData.map((customer) => ({
	nif: customer.nif,
	firstName: customer.firstName,
	lastName: customer.lastName,
	email: customer.email,
	phone: customer.phone,
	registeredAt: faker.date.past({ years: 5 }),
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
		createdAt: faker.date.past({ years: 5 }),

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
await prisma.customer.createMany({ data: customers, skipDuplicates: true });
console.timeEnd("seed:customers");

console.time("seed:address-history");
const initialAddressRecords = customers.map(customer => {
	const jsonCustomer = (customersJson as CustomersJsonItem[]).find(c => c.nif === customer.nif);
	if (jsonCustomer) {
		return {
			customerNif: customer.nif,
			address: jsonCustomer.address,
			city: jsonCustomer.city,
			postalCode: jsonCustomer.postalCode,
			createdAt: customer.registeredAt!,
		};
	}

	return {
		customerNif: customer.nif,
		address: faker.location.streetAddress(),
		city: faker.location.city(),
		postalCode: faker.location.zipCode(),
		createdAt: customer.registeredAt!,
	};
});

const customersWithHistory = faker.helpers.arrayElements(customers, {
	min: Math.floor(CUSTOMER_COUNT * 0.05),
	max: Math.floor(CUSTOMER_COUNT * 0.15),
});

const additionalAddressRecords: {
	customerNif: number;
	address: string;
	city: string;
	postalCode: string;
	createdAt: Date;
}[] = [];

for (const customer of customersWithHistory) {
	const changeCount = faker.number.int({ min: 1, max: 3 });

	for (let i = 0; i < changeCount; i++) {
		const createdAt = faker.date.between({
			from: customer.registeredAt!,
			to: new Date(),
		});

		additionalAddressRecords.push({
			customerNif: customer.nif,
			address: faker.location.streetAddress(),
			city: faker.location.city(),
			postalCode: faker.location.zipCode(),
			createdAt,
		});
	}
}

// Inserting all at once breaks. Batch them instead
const ADDRESS_BATCH_SIZE = 1000;
const allAddressRecords = [...initialAddressRecords, ...additionalAddressRecords];

for (let i = 0; i < allAddressRecords.length; i += ADDRESS_BATCH_SIZE) {
	const batch = allAddressRecords.slice(i, i + ADDRESS_BATCH_SIZE);
	await prisma.customerAddress.createMany({
		data: batch,
	});
}
console.timeEnd("seed:address-history");

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
