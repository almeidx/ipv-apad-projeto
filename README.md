# Pratical Project of Storage and Analytical Processing of Data (APAD)

## Structure

This project is structured as follows:

- `./generator` - Includes the data generators for the PostgreSQL and MongoDB databases,
  included in the `mongo` and `postgres` folders, respectively.
- `./etl` - Contains the ETL (Extract, Transform, Load) scripts for processing
  and moving the data to the Data Mart, which is yet another PostgreSQL database.
- `./olap` - Includes the OLAP (Online Analytical Processing) scripts for querying
	and analyzing the data in the Data Mart.

## Setup

For this project, you'll need a PostgreSQL DBMS (or two separate instances) and a MongoDB database.

1. Rename the `.env.example` file to `.env` and update the connection strings as needed.

### Data generators

Navigate to the `./generator` directory and run the following commands:

```bash
pnpm install --frozen-lockfile
node --run db:migrate:prod
node --run generate-common
node --run generate-postgres
node --run generate-mongo
node --run generate-csv
```

### ETL script

Navigate to the `./etl` directory and run the following commands:

```bash
pnpm install --frozen-lockfile
node --run db:migrate:prod
node --run start
```

### OLAP script

Navigate to the `./olap` directory and run the following commands:

```bash
python3.13 -m pip install -r requirements.txt
streamlit run app.py
```

This should open up the Streamlit app in your browser, allowing you to interact with the OLAP queries and visualizations.
If not, it should be accessible at `http://localhost:8501`.

Enjoy.
