# Script to Generate Data for 3 Shops

import csv
from faker import Faker
import random
from pymongo import MongoClient
import psycopg2
from psycopg2 import sql

# Faker instance
faker = Faker()
Faker.seed(42)

# ------------------------------------
# Shop A: CSV Data Generation
# ------------------------------------
def generate_csv_data():
    print("Generating CSV data for Golden Crust - Porto...")
    with open('golden_crust.csv', 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['sale_id', 'product_name', 'product_qty', 'product_unit_price', 'sale_date', 'customer_name', 'customer_email'])
        for _ in range(100000):
            writer.writerow([
                faker.uuid4(),
                faker.word(),
                random.randint(1, 10),
                round(random.uniform(1, 100), 2),
                str(faker.date_this_year()),
                faker.name(),
                faker.email()
            ])

# ------------------------------------
# Shop B: MongoDB Data Generation
# ------------------------------------
def generate_mongodb_data():
    print("Generating MongoDB data for Golden Crust - Lisboa...")
    client = MongoClient("mongodb://localhost:27017/")
    db = client.golden_crust
    orders_collection = db.orders

    # Clear existing data
    orders_collection.delete_many({})

    order_count = 123456
    customer_count = order_count // 5
    product_count = order_count // 25

    products = [
        {
            "product_id": i,
            "name": faker.word(),
            "price": round(random.uniform(1, 100), 2)
        } for i in range(product_count)
    ]

    customers = [
        {
            "customer_id": i,
            "name": faker.name(),
            "email": faker.email()
        } for i in range(customer_count)
    ]

    for _ in range(order_count):
        items = [
            {
                "product": random.choice(products),
                "qty": random.randint(1, 10)
            } for _ in range(random.randint(1, 5))
        ]

        order = {
            "order_id": faker.uuid4(),
            "customer": random.choice(customers),
            "items": items,
            "total": sum(item["product"]["price"] * item["qty"] for item in items),
            "date": str(faker.date_this_year())
        }
        orders_collection.insert_one(order)

# ------------------------------------
# Shop C: PostgreSQL Data Generation
# ------------------------------------
def generate_postgresql_data():
    print("Generating PostgreSQL data for Golden Crust - Viseu...")

    conn = psycopg2.connect(
        dbname="golden_crust",
        user="postgres",
        password="password",
        host="localhost",
        port="5432"
    )
    cursor = conn.cursor()

    # Create tables
    cursor.execute("""
        DROP TABLE IF EXISTS order_items, orders, products, customers, categories, suppliers, stores, employees CASCADE;
        CREATE TABLE customers (
            id SERIAL PRIMARY KEY,
            name VARCHAR(128) NOT NULL,
            email VARCHAR(256) NOT NULL UNIQUE,
            phone VARCHAR(20),
            address VARCHAR(256),
            city VARCHAR(64),
            postal_code VARCHAR(20),
            country VARCHAR(64),
            birth_date DATE,
            gender VARCHAR(20),
            registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            loyalty_points INTEGER DEFAULT 0,
            customer_segment VARCHAR(50),
            last_purchase_date TIMESTAMP
        );
        CREATE TABLE products (
            id SERIAL PRIMARY KEY,
            name VARCHAR(128) NOT NULL,
            price FLOAT NOT NULL,
            category_id INT,
            description TEXT,
            sku VARCHAR(50) UNIQUE,
            weight FLOAT,
            supplier_id INT,
            stock_quantity INT,
            reorder_level INT,
            cost_price FLOAT,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE orders (
            id SERIAL PRIMARY KEY,
            customer_id INT NOT NULL REFERENCES customers(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            total FLOAT NOT NULL,
            status VARCHAR(50) DEFAULT 'pending',
            payment_method VARCHAR(50),
            shipping_address VARCHAR(256),
            shipping_city VARCHAR(64),
            shipping_postal_code VARCHAR(20),
            shipping_country VARCHAR(64),
            shipping_cost FLOAT DEFAULT 0,
            tax FLOAT DEFAULT 0,
            discount FLOAT DEFAULT 0,
            promo_code VARCHAR(50),
            employee_id INT,
            store_id INT,
            delivery_date TIMESTAMP
        );
        CREATE TABLE order_items (
            id SERIAL PRIMARY KEY,
            order_id INT NOT NULL REFERENCES orders(id),
            product_id INT NOT NULL REFERENCES products(id),
            quantity SMALLINT NOT NULL,
            UNIQUE (order_id, product_id)
        );
        CREATE TABLE categories (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            parent_category_id INT REFERENCES categories(id)
        );
        CREATE TABLE suppliers (
            id SERIAL PRIMARY KEY,
            name VARCHAR(128) NOT NULL,
            contact_name VARCHAR(128),
            email VARCHAR(256),
            phone VARCHAR(20),
            address VARCHAR(256),
            city VARCHAR(64),
            country VARCHAR(64)
        );
        CREATE TABLE stores (
            id SERIAL PRIMARY KEY,
            name VARCHAR(128) NOT NULL,
            address VARCHAR(256),
            city VARCHAR(64),
            postal_code VARCHAR(20),
            country VARCHAR(64),
            manager_id INT,
            opening_date DATE,
            size_sqm FLOAT
        );
        CREATE TABLE employees (
            id SERIAL PRIMARY KEY,
            name VARCHAR(128) NOT NULL,
            email VARCHAR(256) UNIQUE,
            position VARCHAR(100),
            hire_date DATE,
            store_id INT REFERENCES stores(id),
            manager_id INT REFERENCES employees(id)
        );
    """)
    conn.commit()

    order_count = 654321
    customer_count = order_count // 5
    product_count = order_count // 25
    category_count = 15
    supplier_count = 20
    store_count = 5
    employee_count = 30

    # Insert categories first
    categories = []
    for i in range(category_count):
        parent_id = None
        if i > 0 and random.random() < 0.3:  # 30% chance of having a parent category
            parent_id = random.randint(1, i)  # Only use already inserted categories as parents
        categories.append((
            faker.word().capitalize() + " " + random.choice(["Breads", "Pastries", "Cakes", "Desserts", "Cookies"]),
            faker.paragraph(nb_sentences=2),
            parent_id
        ))

    cursor.executemany(
        "INSERT INTO categories (name, description, parent_category_id) VALUES (%s, %s, %s) RETURNING id",
        categories
    )
    conn.commit()

    # Get category IDs
    cursor.execute("SELECT id FROM categories")
    category_ids = [row[0] for row in cursor.fetchall()]

    # Insert suppliers
    suppliers = []
    for _ in range(supplier_count):
        # Generate a shorter phone number format to avoid truncation error
        phone = faker.numerify(text="###-###-###")  # Simple
        suppliers.append((
            faker.company(),
            faker.name(),
            faker.email(),
            phone,
            faker.street_address(),
            faker.city(),
            faker.country()
        ))

    cursor.executemany(
        "INSERT INTO suppliers (name, contact_name, email, phone, address, city, country) VALUES (%s, %s, %s, %s, %s, %s, %s)",
        suppliers
    )
    conn.commit()

    # Get supplier IDs
    cursor.execute("SELECT id FROM suppliers")
    supplier_ids = [row[0] for row in cursor.fetchall()]

    # Insert stores
    stores = []
    for i in range(store_count):
        stores.append((
            f"Golden Crust - {faker.city()}"[:128],  # Limit name to 128 chars
            faker.street_address()[:256],  # Limit address to 256 chars
            faker.city()[:64],  # Limit city to 64 chars
            faker.postcode()[:20],  # Limit postal code to 20 chars
            "Portugal",
            None,  # Will update manager_id after employees are created
            faker.date_between(start_date="-5y", end_date="today"),
            random.randint(100, 500)
        ))

    cursor.executemany(
        "INSERT INTO stores (name, address, city, postal_code, country, manager_id, opening_date, size_sqm) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
        stores
    )
    conn.commit()

    # Get store IDs
    cursor.execute("SELECT id FROM stores")
    store_ids = [row[0] for row in cursor.fetchall()]

    # Insert employees (without managers first)
    positions = ["Baker", "Cashier", "Manager", "Assistant Manager", "Sales Associate", "Cleaner"]
    employees = []
    emails = set()

    for i in range(employee_count):
        while True:
            email = faker.email()
            if email not in emails:
                emails.add(email)
                break

        employees.append((
            faker.name(),
            email,
            random.choice(positions),
            faker.date_between(start_date="-3y", end_date="today"),
            random.choice(store_ids),
            None  # No manager initially
        ))

    cursor.executemany(
        "INSERT INTO employees (name, email, position, hire_date, store_id, manager_id) VALUES (%s, %s, %s, %s, %s, %s)",
        employees
    )
    conn.commit()

    # Get employee IDs and assign some as managers
    cursor.execute("SELECT id FROM employees")
    employee_ids = [row[0] for row in cursor.fetchall()]

    # Assign managers to employees and stores
    for emp_id in employee_ids:
        if random.random() < 0.8:  # 80% of employees have a manager
            manager_id = random.choice(employee_ids)
            if manager_id != emp_id:  # Can't be own manager
                cursor.execute("UPDATE employees SET manager_id = %s WHERE id = %s", (manager_id, emp_id))

    # Assign store managers
    managers = [emp_id for emp_id in employee_ids if random.random() < 0.2]  # 20% of employees can be managers
    for i, store_id in enumerate(store_ids):
        if i < len(managers):
            cursor.execute("UPDATE stores SET manager_id = %s WHERE id = %s", (managers[i], store_id))

    conn.commit()

    # Insert data
    # Customers with more details
    customers = []
    emails = set()
    customer_segments = ["New", "Regular", "VIP", "Inactive", "High Value"]
    genders = ["Male", "Female", "Non-binary", "Prefer not to say"]

    for _ in range(customer_count):
        while True:
            email = faker.email()
            if email not in emails and len(email) <= 256:
                emails.add(email)
                break

        name = faker.name()[:128]  # Limit name to 128 chars
        phone = faker.numerify(text="###-###-###")  # Shorter phone format
        address = faker.street_address()[:256]  # Limit address to 256 chars
        city = faker.city()[:64]  # Limit city to 64 chars
        postal_code = faker.postcode()[:20]  # Limit postal code to 20 chars
        country = faker.country()[:64]  # Limit country to 64 chars

        last_purchase = faker.date_time_between(start_date="-1y", end_date="now") if random.random() < 0.8 else None

        customers.append((
            name,
            email,
            phone,
            address,
            city,
            postal_code,
            country,
            faker.date_of_birth(minimum_age=18, maximum_age=90),
            random.choice(genders),
            faker.date_time_between(start_date="-5y", end_date="now"),
            random.randint(0, 10000),
            random.choice(customer_segments),
            last_purchase
        ))

    cursor.executemany("""
        INSERT INTO customers (
            name, email, phone, address, city, postal_code, country,
            birth_date, gender, registration_date, loyalty_points,
            customer_segment, last_purchase_date
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, customers)
    conn.commit()

    # Get customer IDs
    cursor.execute("SELECT id FROM customers")
    customer_ids = [row[0] for row in cursor.fetchall()]

    # Products with more details
    products = []
    for _ in range(product_count):
        name = faker.word().capitalize()[:128]
        price = round(random.uniform(1, 100), 2)

        sku = faker.bothify(text="SKU-#####-????").upper()[:50]

        products.append((
            name,
            price,
            random.choice(category_ids) if random.random() < 0.9 else None,  # Some products may have no category
            faker.text(max_nb_chars=200),  # Already limited
            sku,
            round(random.uniform(0.1, 5.0), 2),  # Weight in kg
            random.choice(supplier_ids) if random.random() < 0.9 else None,  # Some products may have no supplier
            random.randint(0, 500),  # Stock quantity
            random.randint(10, 50),  # Reorder level
            round(price * random.uniform(0.4, 0.8), 2),  # Cost price (40-80% of selling price)
            random.random() < 0.9,  # 90% active products
        ))

    cursor.executemany("""
        INSERT INTO products (
            name, price, category_id, description, sku, weight,
            supplier_id, stock_quantity, reorder_level, cost_price,
            is_active
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, products)
    conn.commit()

    # Get product IDs
    cursor.execute("SELECT id FROM products")
    product_ids = [row[0] for row in cursor.fetchall()]

    # Orders and Order Items
    product_prices = {product_ids[i]: products[i][1] for i in range(len(product_ids))}

    for _ in range(order_count):
        customer_id = random.choice(customer_ids)  # Use existing customer IDs

        total = 0
        order_items = {}  # Use a dictionary to ensure unique products
        for _ in range(random.randint(1, 5)):
            product_id = random.choice(product_ids)
            if product_id not in order_items:
                quantity = random.randint(1, 10)
                order_items[product_id] = quantity
                total += quantity * product_prices[product_id]

        # When generating orders
        status = random.choices(["pending", "processing", "shipped", "delivered", "cancelled", "returned"],
                                weights=[0.1, 0.1, 0.2, 0.5, 0.05, 0.05])[0]
        payment_method = random.choice(["Credit Card", "Debit Card", "Cash", "Mobile Payment", "Gift Card"])[:50]
        shipping_address = shipping_address[:256]  # Truncate to fit
        shipping_city = shipping_city[:64]  # Truncate to fit
        shipping_postal_code = shipping_postal_code[:20]  # Truncate to fit
        shipping_country = shipping_country[:64]  # Truncate to fit
        promo_code = faker.bothify(text="PROMO##??")[:50] if discount > 0 else None

        # Insert order
        cursor.execute("INSERT INTO orders (customer_id, total) VALUES (%s, %s) RETURNING id", (customer_id, total))
        order_id = cursor.fetchone()[0]

        # Insert order items
        order_items_list = [(order_id, product_id, quantity) for product_id, quantity in order_items.items()]
        cursor.executemany("INSERT INTO order_items (order_id, product_id, quantity) VALUES (%s, %s, %s)", order_items_list)
        conn.commit()

    conn.close()

# ------------------------------------
# Run All Generators
# ------------------------------------
if __name__ == "__main__":
    # generate_csv_data()
    # generate_mongodb_data()
    generate_postgresql_data()
    print("Data generation complete!")
