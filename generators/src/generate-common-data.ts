import { writeFile } from "node:fs/promises";
import { Faker, en, fakerPT_PT as faker, pt_PT } from "@faker-js/faker";

const PRODUCT_COUNT = 100_000;
const CUSTOMER_COUNT = 50_000;

export const seededFaker = new Faker({
	seed: 123,
	locale: [pt_PT, en],
});

{
	const seenEmails = new Set<string>();
	const seenNifs = new Set<number>();

	const customers: CustomersJsonItem[] = [];
	for (let i = 1; i <= CUSTOMER_COUNT; i++) {
		let email: string;
		do {
			email = seededFaker.internet.email();
		} while (seenEmails.has(email));
		seenEmails.add(email);

		let nif: number;
		do {
			nif = seededFaker.number.int({ min: 100_000_000, max: 999_999_999 });
		} while (seenNifs.has(nif));
		seenNifs.add(nif);

		customers.push({
			nif,
			firstName: seededFaker.person.firstName(),
			lastName: seededFaker.person.lastName(),
			email,
			address: seededFaker.location.streetAddress(),
			city: seededFaker.location.city(),
			postalCode: seededFaker.location.zipCode(),
			phone: seededFaker.phone.number({ style: "international" }),
		});
	}

	const customersFile = new URL("generated/customers.json", import.meta.url);
	await writeFile(customersFile, JSON.stringify(customers), "utf-8");
}

{
	const usedSkus = new Set<string>();

	const products: ProductsJsonItem[] = [];
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
			material: seededFaker.commerce.productMaterial(),
		});
	}

	const productsFile = new URL("generated/products.json", import.meta.url);
	await writeFile(productsFile, JSON.stringify(products), "utf-8");
}

export interface CustomersJsonItem {
	nif: number;
	firstName: string;
	lastName: string;
	email: string;
	address: string;
	city: string;
	postalCode: string;
	phone: string;
}

export interface ProductsJsonItem {
	id: number;
	name: string;
	sku: string;
	price: number;
	description: string;
	material: string;
}
