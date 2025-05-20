# Pratical Project of Storage and Analytical Processing of Data (APAD)

## Structure

This project is structured as follows:

- `./generator` - Includes the data generators for the PostgreSQL and MongoDB databases,
  included in the `mongo` and `postgres` folders, respectively.
- `./etl` - Contains the ETL (Extract, Transform, Load) scripts for processing
  and moving the data to the Data Warehouse, which is yet another PostgreSQL database.
- `./olap` - Includes the OLAP (Online Analytical Processing) scripts for querying
	and analyzing the data in the Data Warehouse.

## Setup

For this project, you'll need a PostgreSQL DBMS (or two separate instances) and a MongoDB database.

1. setup envs
1. run the data generators
1. run the ETL script
1. run the OLAP script
