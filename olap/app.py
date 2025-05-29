import streamlit as st
import pandas as pd
import matplotlib.pyplot as plt
import psycopg2
from psycopg2 import Error
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv
from urllib.parse import urlparse

# Load environment variables from .env file
load_dotenv()

# Get database connection string from environment variable
DATABASE_URL = os.getenv("DATA_MART_POSTGRES_URI")

st.set_page_config(
    page_title="OLAP - Gestão de Vendas",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Using a factory here to be able to cache the database connection.
# For some reason caching the connection directly doesn't work
@st.cache_resource
def get_connection_factory():
    def create_connection():
        try:
            # Parse the connection URI
            if DATABASE_URL:
                url = urlparse(DATABASE_URL)
                conn = psycopg2.connect(
                    host=url.hostname,
                    port=url.port,
                    database=url.path[1:],
                    user=url.username,
                    password=url.password,
                )
                return conn
            else:
                st.sidebar.error("❌ DATABASE_URL not found in environment variables")
                return None
        except Exception as e:
            st.sidebar.error(f"❌ Database connection error: {e}")
            return None
    return create_connection

conn_factory = get_connection_factory()

@st.cache_data
def run_query(query):
    conn = conn_factory()
    if conn:
        try:
            with conn.cursor() as cur:
                # print(query)
                cur.execute(query)
                results = cur.fetchall()
                if not results:
                    st.sidebar.warning("⚠️ Query returned no data")
                return results
        except Error as e:
            st.sidebar.error(f"❌ Query error: {e}")
            return None
        finally:
            conn.close()
    return None

st.markdown("<h1>📊 OLAP - Gestão de Vendas</h1>", unsafe_allow_html=True)

st.sidebar.title("📌 Menu")
opcao = st.sidebar.radio("Selecione uma opção:", [
    "🏬 Vendas por Loja",
    "📄 Vendas por Tipos de Documento",
    "📦 Vendas por Produtos",
    "👥 Vendas por Clientes",
    "📅 Vendas por Datas",
    "🔍 Visão Analítica"
])

st.sidebar.markdown("---")
st.sidebar.header("Filtros de Data")

default_end_date = datetime.now()
default_start_date = default_end_date - timedelta(days=365)

start_date = st.sidebar.date_input("Data Inicial", value=default_start_date)
end_date = st.sidebar.date_input("Data Final", value=default_end_date)

if start_date and end_date:
    date_filter_query = f"""
    SELECT MIN(id), MAX(id) FROM d_dates
    WHERE (year > {start_date.year} OR (year = {start_date.year} AND month > {start_date.month})
           OR (year = {start_date.year} AND month = {start_date.month} AND day >= {start_date.day}))
    AND (year < {end_date.year} OR (year = {end_date.year} AND month < {end_date.month})
         OR (year = {end_date.year} AND month = {end_date.month} AND day <= {end_date.day}))
    """
    date_ids = run_query(date_filter_query)
    if date_ids and date_ids[0][0] is not None:
        min_date_id, max_date_id = date_ids[0]
        date_filter = f"AND s.date_id BETWEEN {min_date_id} AND {max_date_id}"
    else:
        date_filter = ""
else:
    date_filter = ""

def to_dataframe(data, columns):
    if data:
        return pd.DataFrame(data, columns=columns)
    return pd.DataFrame()

if opcao == "🏬 Vendas por Loja":
    st.header("Análise de Vendas por Loja")

    query = f"""
    SELECT st.name, st.location, SUM(s.total_amount) as total_sales, COUNT(s.id) as num_transactions
    FROM sales s
    JOIN d_stores st ON s.store_id = st.id
    WHERE 1=1 {date_filter}
    GROUP BY st.name, st.location
    ORDER BY total_sales DESC
    """

    results = run_query(query)
    df = to_dataframe(results, ["Loja", "Localização", "Total Vendas", "Número de Transações"])

    if not df.empty:
        col1, col2 = st.columns(2)

        with col1:
            fig1 = px.bar(
                df,
                x="Loja",
                y="Total Vendas",
                title="Total de Vendas por Loja",
                text="Total Vendas",
                color="Loja",
                labels={"Total Vendas": "Montante Total (€)"}
            )
            fig1.update_traces(texttemplate='%{text:.2f} €', textposition='outside')
            st.plotly_chart(fig1, use_container_width=True)

        with col2:
            fig2 = px.scatter(
                df,
                x="Loja",
                y="Número de Transações",
                size="Total Vendas",
                color="Loja",
                title="Número de Transações por Loja",
                hover_data=["Localização"]
            )
            st.plotly_chart(fig2, use_container_width=True)

        st.subheader("Detalhes por Loja")
        st.dataframe(df.style.format({"Total Vendas": "{:.2f} €"}))
    else:
        st.info("Sem dados para exibir. Tente ajustar os filtros.")

elif opcao == "📄 Vendas por Tipos de Documento":
    st.header("Análise de Vendas por Tipo de Documento")

    query = f"""
    SELECT dt.name, SUM(s.total_amount) as total_sales, COUNT(s.id) as num_transactions
    FROM sales s
    JOIN d_document_types dt ON s.document_type_id = dt.id
    WHERE 1=1 {date_filter}
    GROUP BY dt.name
    ORDER BY total_sales DESC
    """

    results = run_query(query)
    df = to_dataframe(results, ["Tipo de Documento", "Total Vendas", "Número de Transações"])

    if not df.empty:
        col1, col2 = st.columns(2)

        with col1:
            fig1 = px.pie(
                df,
                values="Total Vendas",
                names="Tipo de Documento",
                title="Distribuição de Vendas por Tipo de Documento",
                hole=0.4
            )
            fig1.update_traces(textinfo="percent+label")
            st.plotly_chart(fig1, use_container_width=True)

        with col2:
            fig2 = px.bar(
                df,
                x="Tipo de Documento",
                y="Número de Transações",
                title="Número de Transações por Tipo de Documento",
                color="Tipo de Documento",
                text="Número de Transações"
            )
            fig2.update_traces(texttemplate='%{text}', textposition='outside')
            st.plotly_chart(fig2, use_container_width=True)

        st.subheader("Detalhes por Tipo de Documento")
        st.dataframe(df.style.format({"Total Vendas": "{:.2f} €"}))
    else:
        st.info("Sem dados para exibir. Tente ajustar os filtros.")

elif opcao == "📦 Vendas por Produtos":
    st.header("Análise de Vendas por Produtos")

    top_n = st.slider("Mostrar Top N Produtos", min_value=5, max_value=50, value=10)

    query = f"""
    SELECT p.name, p.sku, p.material,
           SUM(s.total_amount) as total_sales,
           SUM(s.quantity) as total_quantity,
           AVG(s.unit_price) as avg_price
    FROM sales s
    JOIN d_products p ON s.product_id = p.id
    WHERE 1=1 {date_filter}
    GROUP BY p.name, p.sku, p.material
    ORDER BY total_sales DESC
    LIMIT {top_n}
    """

    results = run_query(query)
    df = to_dataframe(results, ["Produto", "SKU", "Material", "Total Vendas", "Quantidade Vendida", "Preço Médio"])

    if not df.empty:
        col1, col2 = st.columns(2)

        with col1:
            fig1 = px.bar(
                df.sort_values("Total Vendas"),
                y="Produto",
                x="Total Vendas",
                title=f"Top {top_n} Produtos por Valor de Vendas",
                orientation="h",
                color="Total Vendas",
                text="Total Vendas",
                labels={"Total Vendas": "Montante Total (€)"}
            )
            fig1.update_traces(texttemplate='%{text:.2f} €', textposition='outside')
            st.plotly_chart(fig1, use_container_width=True)

        with col2:
            fig2 = px.scatter(
                df,
                x="Preço Médio",
                y="Quantidade Vendida",
                size="Total Vendas",
                color="Material" if df["Material"].notna().any() else None,
                hover_name="Produto",
                title="Relação entre Preço Médio e Quantidade Vendida",
                labels={"Preço Médio": "Preço Médio (€)"}
            )
            st.plotly_chart(fig2, use_container_width=True)

        st.subheader("Detalhes por Produto")
        st.dataframe(df.style.format({
            "Total Vendas": "{:.2f} €",
            "Preço Médio": "{:.2f} €"
        }))
    else:
        st.info("Sem dados para exibir. Tente ajustar os filtros.")

elif opcao == "👥 Vendas por Clientes":
    st.header("Análise de Vendas por Clientes")

    top_n = st.slider("Mostrar Top N Clientes", min_value=5, max_value=50, value=10)

    query = f"""
    SELECT c.name, c.email, SUM(s.total_amount) as total_sales,
           COUNT(DISTINCT s.id) as num_transactions,
           AVG(s.total_amount) as avg_transaction_value
    FROM sales s
    JOIN d_customers c ON s.customer_id = c.id
    WHERE 1=1 {date_filter}
    GROUP BY c.name, c.email
    ORDER BY total_sales DESC
    LIMIT {top_n}
    """

    results = run_query(query)
    df = to_dataframe(results, ["Cliente", "Email", "Total Compras", "Número Transações", "Valor Médio"])

    if not df.empty:
        col1, col2 = st.columns(2)

        with col1:
            fig1 = px.bar(
                df.sort_values("Total Compras", ascending=False).head(10),
                x="Cliente",
                y="Total Compras",
                title=f"Top {top_n} Clientes por Valor de Compras",
                color="Total Compras",
                text="Total Compras",
                labels={"Total Compras": "Montante Total (€)"}
            )
            fig1.update_layout(xaxis={'categoryorder':'total descending'})
            fig1.update_traces(texttemplate='%{text:.2f} €', textposition='outside')
            st.plotly_chart(fig1, use_container_width=True)

        with col2:
            fig2 = px.scatter(
                df,
                x="Número Transações",
                y="Valor Médio",
                size="Total Compras",
                hover_name="Cliente",
                title="Frequência vs Valor Médio por Cliente",
                labels={"Valor Médio": "Valor Médio por Transação (€)"}
            )
            st.plotly_chart(fig2, use_container_width=True)

        st.subheader("Detalhes por Cliente")
        df["Email"] = df["Email"].apply(lambda x: x.split("@")[0][:3] + "***@" + x.split("@")[1])
        st.dataframe(df.style.format({
            "Total Compras": "{:.2f} €",
            "Valor Médio": "{:.2f} €"
        }))
    else:
        st.info("Sem dados para exibir. Tente ajustar os filtros.")

elif opcao == "📅 Vendas por Datas":
    st.header("Análise de Vendas por Período")

    granularity = st.radio("Selecione a Granularidade", ["Diário", "Mensal", "Anual"])

    time_group = ""
    if granularity == "Diário":
        time_group = "d.year, d.month, d.day"
        time_format = "TO_CHAR(MAKE_DATE(d.year, d.month, d.day), 'DD/MM/YYYY') as period"
        sort = "d.year, d.month, d.day"
    elif granularity == "Mensal":
        time_group = "d.year, d.month"
        time_format = "TO_CHAR(MAKE_DATE(d.year, d.month, 1), 'MM/YYYY') as period"
        sort = "d.year, d.month"
    else:  # Anual
        time_group = "d.year"
        time_format = "d.year::text as period"
        sort = "d.year"

    query = f"""
    SELECT {time_format}, SUM(s.total_amount) as total_sales,
           COUNT(s.id) as num_transactions,
           AVG(s.total_amount) as avg_transaction_value
    FROM sales s
    JOIN d_dates d ON s.date_id = d.id
    WHERE 1=1 {date_filter}
    GROUP BY {time_group}
    ORDER BY {sort}
    """

    results = run_query(query)
    df = to_dataframe(results, ["Período", "Total Vendas", "Número Transações", "Valor Médio"])

    if not df.empty:
        col1, col2 = st.columns(2)

        with col1:
            fig1 = px.line(
                df,
                x="Período",
                y="Total Vendas",
                title=f"Evolução de Vendas ({granularity})",
                markers=True,
                labels={"Total Vendas": "Montante Total (€)"}
            )
            st.plotly_chart(fig1, use_container_width=True)

        with col2:
            fig2 = px.bar(
                df,
                x="Período",
                y="Número Transações",
                title=f"Número de Transações ({granularity})",
                color="Valor Médio",
                labels={"Número Transações": "Quantidade", "Valor Médio": "Valor Médio (€)"}
            )
            st.plotly_chart(fig2, use_container_width=True)

        total_period = df["Total Vendas"].sum()
        avg_period = df["Total Vendas"].mean()
        max_period = df["Total Vendas"].max()
        max_period_time = df.loc[df["Total Vendas"].idxmax()]["Período"]

        col1, col2, col3 = st.columns(3)
        col1.metric("Total de Vendas no Período", f"{total_period:.2f} €")
        col2.metric(f"Média de Vendas por {granularity if granularity != 'Mensal' else 'Mês'}", f"{avg_period:.2f} €")
        col3.metric(f"Melhor {granularity if granularity != 'Mensal' else 'Mês'}", f"{max_period:.2f} € ({max_period_time})")

        st.subheader(f"Detalhes por {granularity}")
        st.dataframe(df.style.format({
            "Total Vendas": "{:.2f} €",
            "Valor Médio": "{:.2f} €"
        }))
    else:
        st.info("Sem dados para exibir. Tente ajustar os filtros.")

elif opcao == "🔍 Visão Analítica":
    st.header("Visão Analítica Multidimensional")

    st.subheader("Operações OLAP")

    olap_tab = st.tabs(["Slice", "Dice", "Drill-down", "Roll-up", "Pivot"])

    with olap_tab[0]:  # Slice
        slice_dim = st.selectbox("Selecione a dimensão para filtrar:",
                               ["Loja", "Produto", "Cliente", "Tipo de Documento", "Ano"])

        slice_query_map = {
            "Loja": "SELECT DISTINCT name FROM d_stores ORDER BY name",
            "Produto": "SELECT DISTINCT name FROM d_products ORDER BY name LIMIT 100",
            "Cliente": "SELECT DISTINCT name FROM d_customers ORDER BY name LIMIT 100",
            "Tipo de Documento": "SELECT DISTINCT name FROM d_document_types ORDER BY name",
            "Ano": "SELECT DISTINCT year FROM d_dates ORDER BY year"
        }

        slice_values = run_query(slice_query_map[slice_dim])
        if slice_values:
            slice_options = [row[0] for row in slice_values]
            slice_value = st.selectbox(f"Selecione o valor para {slice_dim}:", slice_options)

            if st.button("Aplicar Slice"):
                slice_filter_map = {
                    "Loja": f"JOIN d_stores st ON s.store_id = st.id WHERE st.name = '{slice_value}'",
                    "Produto": f"JOIN d_products p ON s.product_id = p.id WHERE p.name = '{slice_value}'",
                    "Cliente": f"JOIN d_customers c ON s.customer_id = c.id WHERE c.name = '{slice_value}'",
                    "Tipo de Documento": f"JOIN d_document_types dt ON s.document_type_id = dt.id WHERE dt.name = '{slice_value}'",
                    "Ano": f"JOIN d_dates d ON s.date_id = d.id WHERE d.year = {slice_value}"
                }

                slice_query = f"""
                SELECT TO_CHAR(MAKE_DATE(d.year, d.month, 1), 'MM/YYYY') as period,
                       SUM(s.total_amount) as total_sales
                FROM sales s
                JOIN d_dates d ON s.date_id = d.id
                {slice_filter_map[slice_dim]}
                GROUP BY d.year, d.month
                ORDER BY d.year, d.month
                LIMIT 100
                """

                slice_results = run_query(slice_query)
                if slice_results:
                    slice_df = to_dataframe(slice_results, ["Período", "Total Vendas"])
                    st.write(f"Resultados do Slice para {slice_dim} = {slice_value}:")

                    fig = px.bar(
                        slice_df,
                        x="Período",
                        y="Total Vendas",
                        title=f"Vendas para {slice_dim} = {slice_value}",
                        text="Total Vendas"
                    )
                    fig.update_traces(texttemplate='%{text:.2f} €', textposition='outside')
                    st.plotly_chart(fig, use_container_width=True)
                else:
                    st.info("Sem dados para este filtro.")

    with olap_tab[1]:  # Dice
        col1, col2 = st.columns(2)

        with col1:
            dice_dim1 = st.selectbox("Primeira dimensão:",
                                   ["Loja", "Produto", "Tipo de Documento"])

            dice_query1 = {
                "Loja": "SELECT DISTINCT name FROM d_stores ORDER BY name",
                "Produto": "SELECT DISTINCT name FROM d_products ORDER BY name LIMIT 100",
                "Tipo de Documento": "SELECT DISTINCT name FROM d_document_types ORDER BY name"
            }

            dice_values1 = run_query(dice_query1[dice_dim1])
            if dice_values1:
                dice_options1 = [row[0] for row in dice_values1]
                dice_value1 = st.selectbox(f"Valor para {dice_dim1}:", dice_options1)

        with col2:
            dice_dim2 = st.selectbox("Segunda dimensão:",
                                   ["Tipo de Documento", "Loja", "Produto"],
                                   index=1 if dice_dim1 == "Tipo de Documento" else 0)

            if dice_dim2 == dice_dim1:
                st.error("Selecione dimensões diferentes")
            else:
                dice_query2 = {
                    "Loja": "SELECT DISTINCT name FROM d_stores ORDER BY name",
                    "Produto": "SELECT DISTINCT name FROM d_products ORDER BY name LIMIT 100",
                    "Tipo de Documento": "SELECT DISTINCT name FROM d_document_types ORDER BY name"
                }

                dice_values2 = run_query(dice_query2[dice_dim2])
                if dice_values2:
                    dice_options2 = [row[0] for row in dice_values2]
                    dice_value2 = st.selectbox(f"Valor para {dice_dim2}:", dice_options2)

        if dice_dim1 != dice_dim2 and st.button("Aplicar Dice"):
            dice_filter_map = {
                "Loja": "JOIN d_stores st ON s.store_id = st.id",
                "Produto": "JOIN d_products p ON s.product_id = p.id",
                "Tipo de Documento": "JOIN d_document_types dt ON s.document_type_id = dt.id"
            }

            dice_where_map = {
                "Loja": f"st.name = '{dice_value1}'",
                "Produto": f"p.name = '{dice_value1}'",
                "Tipo de Documento": f"dt.name = '{dice_value1}'"
            }

            dice_where_map2 = {
                "Loja": f"st.name = '{dice_value2}'",
                "Produto": f"p.name = '{dice_value2}'",
                "Tipo de Documento": f"dt.name = '{dice_value2}'"
            }

            dice_query = f"""
            SELECT TO_CHAR(MAKE_DATE(d.year, d.month, 1), 'MM/YYYY') as period,
                   SUM(s.total_amount) as total_sales
            FROM sales s
            JOIN d_dates d ON s.date_id = d.id
            {dice_filter_map[dice_dim1]}
            {dice_filter_map[dice_dim2]}
            WHERE {dice_where_map[dice_dim1]} AND {dice_where_map2[dice_dim2]}
            GROUP BY d.year, d.month
            ORDER BY d.year, d.month
            """

            dice_results = run_query(dice_query)
            if dice_results:
                dice_df = to_dataframe(dice_results, ["Período", "Total Vendas"])
                st.write(f"Resultados do Dice para {dice_dim1}={dice_value1} e {dice_dim2}={dice_value2}:")

                fig = px.line(
                    dice_df,
                    x="Período",
                    y="Total Vendas",
                    title=f"Vendas para {dice_dim1}={dice_value1} e {dice_dim2}={dice_value2}",
                    markers=True
                )
                st.plotly_chart(fig, use_container_width=True)

                st.dataframe(dice_df.style.format({"Total Vendas": "{:.2f} €"}))
            else:
                st.info("Sem dados para os filtros selecionados.")

    with olap_tab[2]:  # Drill-down
        drill_levels = ["Ano", "Mês", "Dia"]
        current_level = st.selectbox("Selecione o nível de detalhe:", drill_levels, index=0)

        if current_level == "Ano":
            drill_query = f"""
            SELECT d.year as period, SUM(s.total_amount) as total_sales
            FROM sales s
            JOIN d_dates d ON s.date_id = d.id
            WHERE 1=1 {date_filter}
            GROUP BY d.year
            ORDER BY d.year
            """
            period_label = "Ano"
        elif current_level == "Mês":
            drill_query = f"""
            SELECT TO_CHAR(MAKE_DATE(d.year, d.month, 1), 'MM/YYYY') as period,
                   SUM(s.total_amount) as total_sales
            FROM sales s
            JOIN d_dates d ON s.date_id = d.id
            WHERE 1=1 {date_filter}
            GROUP BY d.year, d.month
            ORDER BY d.year, d.month
            """
            period_label = "Mês"
        else:  # Dia
            drill_query = f"""
            SELECT TO_CHAR(MAKE_DATE(d.year, d.month, d.day), 'DD/MM/YYYY') as period,
                   SUM(s.total_amount) as total_sales
            FROM sales s
            JOIN d_dates d ON s.date_id = d.id
            WHERE 1=1 {date_filter}
            GROUP BY d.year, d.month, d.day
            ORDER BY d.year, d.month, d.day
            LIMIT 100
            """
            period_label = "Dia"

        drill_results = run_query(drill_query)
        if drill_results:
            drill_df = to_dataframe(drill_results, [period_label, "Total Vendas"])

            fig = px.line(
                drill_df,
                x=period_label,
                y="Total Vendas",
                title=f"Drill-down - Vendas por {period_label}",
                markers=True
            )
            st.plotly_chart(fig, use_container_width=True)

            st.dataframe(drill_df.style.format({"Total Vendas": "{:.2f} €"}))

            st.caption(f"Use a caixa de seleção acima para navegar entre os níveis {', '.join(drill_levels)}")
        else:
            st.info("Sem dados para este nível de detalhe.")

    with olap_tab[3]:  # Roll-up
        rollup_options = ["Produto → Categoria", "Dia → Mês → Ano", "Loja → Localização"]
        rollup_choice = st.radio("Selecione o tipo de roll-up:", rollup_options)

        if rollup_choice == "Dia → Mês → Ano":
            granularity = st.selectbox("Selecione a granularidade:", ["Dia", "Mês", "Ano"])

            if granularity == "Dia":
                rollup_query = f"""
                SELECT TO_CHAR(MAKE_DATE(d.year, d.month, d.day), 'DD/MM/YYYY') as period,
                       SUM(s.total_amount) as total_sales
                FROM sales s
                JOIN d_dates d ON s.date_id = d.id
                WHERE 1=1 {date_filter}
                GROUP BY d.year, d.month, d.day
                ORDER BY d.year, d.month, d.day
                LIMIT 100
                """
                title = "Vendas diárias"
            elif granularity == "Mês":
                rollup_query = f"""
                SELECT TO_CHAR(MAKE_DATE(d.year, d.month, 1), 'MM/YYYY') as period,
                       SUM(s.total_amount) as total_sales
                FROM sales s
                JOIN d_dates d ON s.date_id = d.id
                WHERE 1=1 {date_filter}
                GROUP BY d.year, d.month
                ORDER BY d.year, d.month
                """
                title = "Vendas mensais (roll-up de dias)"
            else:  # Ano
                rollup_query = f"""
                SELECT d.year::text as period,
                       SUM(s.total_amount) as total_sales
                FROM sales s
                JOIN d_dates d ON s.date_id = d.id
                WHERE 1=1 {date_filter}
                GROUP BY d.year
                ORDER BY d.year
                """
                title = "Vendas anuais (roll-up de meses)"

            rollup_results = run_query(rollup_query)
            if rollup_results:
                rollup_df = to_dataframe(rollup_results, ["Período", "Total Vendas"])

                fig = px.bar(
                    rollup_df,
                    x="Período",
                    y="Total Vendas",
                    title=title,
                    text="Total Vendas"
                )
                fig.update_traces(texttemplate='%{text:.2f} €', textposition='outside')
                st.plotly_chart(fig, use_container_width=True)

                st.metric("Total do período", f"{rollup_df['Total Vendas'].sum():.2f} €")
                st.dataframe(rollup_df.style.format({"Total Vendas": "{:.2f} €"}))
            else:
                st.info("Sem dados para esta granularidade.")

        elif rollup_choice == "Produto → Categoria":
            rollup_query = f"""
            SELECT
                CASE WHEN p.material IS NULL THEN 'Não Especificado' ELSE p.material END as category,
                SUM(s.total_amount) as total_sales,
                COUNT(DISTINCT p.id) as num_products
            FROM sales s
            JOIN d_products p ON s.product_id = p.id
            WHERE 1=1 {date_filter}
            GROUP BY category
            ORDER BY total_sales DESC
            """

            rollup_results = run_query(rollup_query)
            if rollup_results:
                rollup_df = to_dataframe(rollup_results, ["Categoria", "Total Vendas", "Número de Produtos"])

                fig = px.pie(
                    rollup_df,
                    values="Total Vendas",
                    names="Categoria",
                    title="Roll-up: Vendas por Categoria de Produto",
                    hover_data=["Número de Produtos"]
                )
                st.plotly_chart(fig, use_container_width=True)

                st.dataframe(rollup_df.style.format({"Total Vendas": "{:.2f} €"}))
            else:
                st.info("Sem dados para categorização de produtos.")

        else:  # Loja → Localização
            rollup_query = f"""
            SELECT
                st.location,
                SUM(s.total_amount) as total_sales,
                COUNT(DISTINCT st.id) as num_stores
            FROM sales s
            JOIN d_stores st ON s.store_id = st.id
            WHERE 1=1 {date_filter}
            GROUP BY st.location
            ORDER BY total_sales DESC
            """

            rollup_results = run_query(rollup_query)
            if rollup_results:
                rollup_df = to_dataframe(rollup_results, ["Localização", "Total Vendas", "Número de Lojas"])

                fig = px.bar(
                    rollup_df,
                    x="Localização",
                    y="Total Vendas",
                    title="Roll-up: Vendas por Localização",
                    text="Total Vendas",
                    color="Número de Lojas"
                )
                fig.update_traces(texttemplate='%{text:.2f} €', textposition='outside')
                st.plotly_chart(fig, use_container_width=True)

                st.dataframe(rollup_df.style.format({"Total Vendas": "{:.2f} €"}))
            else:
                st.info("Sem dados para agrupamento por localização.")

    with olap_tab[4]:  # Pivot
        col1, col2 = st.columns(2)

        with col1:
            pivot_rows = st.selectbox(
                "Selecionar dimensão para linhas:",
                ["Loja", "Produto", "Tipo de Documento", "Mês", "Ano"]
            )

        with col2:
            pivot_cols_options = [x for x in ["Loja", "Produto", "Tipo de Documento", "Mês", "Ano"] if x != pivot_rows]
            pivot_cols = st.selectbox("Selecionar dimensão para colunas:", pivot_cols_options)

        pivot_map = {
            "Loja": "st.name",
            "Produto": "p.name",
            "Tipo de Documento": "dt.name",
            "Mês": "TO_CHAR(MAKE_DATE(d.year, d.month, 1), 'MM/YYYY')",
            "Ano": "d.year::text"
        }

        pivot_join_map = {
            "Loja": "JOIN d_stores st ON s.store_id = st.id",
            "Produto": "JOIN d_products p ON s.product_id = p.id",
            "Tipo de Documento": "JOIN d_document_types dt ON s.document_type_id = dt.id",
            "Mês": "JOIN d_dates d ON s.date_id = d.id",
            "Ano": "JOIN d_dates d ON s.date_id = d.id"
        }

        pivot_joins = []
        if pivot_rows in pivot_join_map:
            pivot_joins.append(pivot_join_map[pivot_rows])
        if pivot_cols in pivot_join_map and pivot_join_map[pivot_cols] not in pivot_joins:
            pivot_joins.append(pivot_join_map[pivot_cols])

        pivot_query = f"""
        SELECT
            {pivot_map[pivot_rows]} as row_dim,
            {pivot_map[pivot_cols]} as col_dim,
            SUM(s.total_amount) as total_sales
        FROM sales s
        {' '.join(pivot_joins)}
        WHERE 1=1 {date_filter}
        GROUP BY row_dim, col_dim
        ORDER BY row_dim, col_dim
        """

        pivot_results = run_query(pivot_query)
        if pivot_results:
            pivot_raw_df = to_dataframe(pivot_results, ["Linha", "Coluna", "Total Vendas"])

            pivot_df = pivot_raw_df.pivot_table(
                index="Linha",
                columns="Coluna",
                values="Total Vendas",
                aggfunc="sum",
                fill_value=0
            )

            st.subheader(f"Tabela Pivô: {pivot_rows} vs {pivot_cols}")
            st.dataframe(pivot_df.style.background_gradient(cmap="Blues").format("{:.2f} €"))

            st.subheader("Visualização da Tabela Pivô")

            pivot_display = pivot_raw_df.copy()
            pivot_display.columns = [pivot_rows, pivot_cols, "Valor"]

            fig = px.density_heatmap(
                pivot_display,
                x=pivot_cols,
                y=pivot_rows,
                z="Valor",
                title=f"Pivot: {pivot_rows} vs {pivot_cols}",
                labels={"color": "Vendas (€)"}
            )
            st.plotly_chart(fig, use_container_width=True)

            csv = pivot_df.reset_index().to_csv(index=False).encode('utf-8')
            st.download_button(
                "Baixar Tabela Pivô (CSV)",
                data=csv,
                file_name=f"pivot_{pivot_rows}_{pivot_cols}.csv",
                mime='text/csv',
            )
        else:
            st.info("Sem dados suficientes para criar a tabela pivô.")

    st.markdown("---")
    st.header("Análise Multidimensional Personalizada")

    col1, col2 = st.columns(2)

    with col1:
        dim1 = st.selectbox(
            "Dimensão Primária",
            ["Loja", "Produto", "Cliente", "Tipo de Documento", "Data (Mês)", "Data (Ano)"]
        )

    with col2:
        dim2 = st.selectbox(
            "Dimensão Secundária (opcional)",
            ["Nenhuma", "Loja", "Produto", "Cliente", "Tipo de Documento", "Data (Mês)", "Data (Ano)"],
            index=0
        )

    dim_map = {
        "Loja": ("st.name", "d_stores st ON s.store_id = st.id"),
        "Produto": ("p.name", "d_products p ON s.product_id = p.id"),
        "Cliente": ("c.name", "d_customers c ON s.customer_id = c.id"),
        "Tipo de Documento": ("dt.name", "d_document_types dt ON s.document_type_id = dt.id"),
        "Data (Mês)": ("TO_CHAR(MAKE_DATE(d.year, d.month, 1), 'MM/YYYY')", "d_dates d ON s.date_id = d.id"),
        "Data (Ano)": ("d.year::text", "d_dates d ON s.date_id = d.id")
    }

    select_dim1 = dim_map[dim1][0] + " as dim1"
    join_dim1 = dim_map[dim1][1]

    if dim2 != "Nenhuma" and dim2 != dim1:
        select_dim2 = ", " + dim_map[dim2][0] + " as dim2"
        join_dim2 = dim_map[dim2][1] if dim_map[dim2][1] not in join_dim1 else ""
        group_by = "dim1, dim2"
        order_by = "total_sales DESC, dim1, dim2"
    else:
        select_dim2 = ""
        join_dim2 = ""
        group_by = "dim1"
        order_by = "total_sales DESC, dim1"

    joins = f"""
    JOIN {join_dim1}
    {f'JOIN {join_dim2}' if join_dim2 else ''}
    """

    query = f"""
    SELECT {select_dim1}{select_dim2},
           SUM(s.total_amount) as total_sales,
           COUNT(s.id) as num_transactions,
           AVG(s.total_amount) as avg_transaction_value,
           SUM(s.quantity) as total_quantity
    FROM sales s
    {joins}
    WHERE 1=1 {date_filter}
    GROUP BY {group_by}
    ORDER BY {order_by}
    LIMIT 100
    """

    results = run_query(query)

    if dim2 != "Nenhuma" and dim2 != dim1:
        df = to_dataframe(results, [dim1, dim2, "Total Vendas", "Num. Transações", "Valor Médio", "Quantidade"])
    else:
        df = to_dataframe(results, [dim1, "Total Vendas", "Num. Transações", "Valor Médio", "Quantidade"])

    if not df.empty:
        if dim2 != "Nenhuma" and dim2 != dim1:
            fig1 = px.treemap(
                df,
                path=[dim1, dim2],
                values="Total Vendas",
                color="Total Vendas",
                title=f"Análise de Vendas por {dim1} e {dim2}",
                hover_data=["Num. Transações", "Quantidade"]
            )
            st.plotly_chart(fig1, use_container_width=True)

            pivot_df = df.pivot_table(
                index=dim1,
                columns=dim2,
                values="Total Vendas",
                aggfunc="sum",
                fill_value=0
            )

            st.subheader(f"Tabela Pivô: {dim1} vs {dim2}")
            st.dataframe(pivot_df.style.background_gradient(cmap="Blues").format("{:.2f} €"))

        else:
            fig1 = px.bar(
                df.sort_values("Total Vendas", ascending=False).head(15),
                x=dim1,
                y="Total Vendas",
                title=f"Análise de Vendas por {dim1}",
                color="Total Vendas",
                text="Total Vendas",
                labels={"Total Vendas": "Montante Total (€)"}
            )
            fig1.update_layout(xaxis={'categoryorder':'total descending'})
            fig1.update_traces(texttemplate='%{text:.2f} €', textposition='outside')
            st.plotly_chart(fig1, use_container_width=True)

        st.subheader("Resumo Estatístico")
        st.dataframe(df.describe().style.format("{:.2f}"))

        csv = df.to_csv(index=False).encode('utf-8')
        st.download_button(
            "Baixar Dados (CSV)",
            data=csv,
            file_name=f"analise_{dim1.lower()}_{dim2.lower() if dim2 != 'Nenhuma' else 'sem_dim2'}.csv",
            mime='text/csv',
        )
    else:
        st.info("Sem dados para exibir. Tente ajustar os filtros.")

st.markdown("---")
st.markdown(
    """
    <div style='text-align: center; color: gray; font-size: 14px;'>
        OLAP - Gestão de Vendas | Desenvolvido com Streamlit | Dados em PostgreSQL
    </div>
    """,
    unsafe_allow_html=True
)
