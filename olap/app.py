import streamlit as st
import pandas as pd
import matplotlib.pyplot as plt
import psycopg2
from psycopg2 import Error
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, timedelta

st.set_page_config(
    page_title="OLAP - Gestão de Vendas",
    layout="wide",
    initial_sidebar_state="expanded"
)

# @st.cache_resource
def init_connection():
    try:
        conn = psycopg2.connect(
            host="localhost",
            port="5432",
            database="datamart",
            user="postgres",
            password="password",
        )
        # Verify connection is successful
        if conn:
            st.sidebar.success("✅ Database connected")
        return conn
    except Error as e:
        st.sidebar.error(f"❌ Database connection error: {e}")
        return None

# @st.cache_data
def run_query(query):
    conn = init_connection()
    if conn:
        try:
            with conn.cursor() as cur:
                # Print query for debugging
                print(f"Executing query: {query}")
                cur.execute(query)
                results = cur.fetchall()
                if results:
                    st.sidebar.success(f"✅ Query returned {len(results)} rows")
                else:
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
opcao = st.sidebar.radio("Seleciona a opção:", [
    "🏬 Vendas por Loja",
    "📄 Vendas por Tipos de Documento",
    "📦 Vendas por Produtos",
    "👥 Vendas por Clientes",
    "📅 Vendas por Datas",
    "🔍 Visão Analítica"
])

# Common date filter for all views
st.sidebar.markdown("---")
st.sidebar.header("Filtros de Data")

# Default to last 12 months
default_end_date = datetime.now()
default_start_date = default_end_date - timedelta(days=365)

start_date = st.sidebar.date_input("Data Inicial", value=default_start_date)
end_date = st.sidebar.date_input("Data Final", value=default_end_date)

# Get date IDs for filtering
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

# Function to convert query results to DataFrame
def to_dataframe(data, columns):
    if data:
        return pd.DataFrame(data, columns=columns)
    return pd.DataFrame()

if opcao == "🏬 Vendas por Loja":
    st.header("Análise de Vendas por Loja")

    # Query para vendas por loja
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
            # Gráfico de barras para total de vendas por loja
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
            # Mapa de calor para número de transações
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

        # Tabela com os dados
        st.subheader("Detalhes por Loja")
        st.dataframe(df.style.format({"Total Vendas": "{:.2f} €"}))
    else:
        st.info("Sem dados para exibir. Tente ajustar os filtros.")

elif opcao == "📄 Vendas por Tipos de Documento":
    st.header("Análise de Vendas por Tipo de Documento")

    # Query para vendas por tipo de documento
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
            # Gráfico de pizza para proporção de vendas por tipo de documento
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
            # Gráfico de barras para número de transações
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

        # Tabela com os dados
        st.subheader("Detalhes por Tipo de Documento")
        st.dataframe(df.style.format({"Total Vendas": "{:.2f} €"}))
    else:
        st.info("Sem dados para exibir. Tente ajustar os filtros.")

elif opcao == "📦 Vendas por Produtos":
    st.header("Análise de Vendas por Produtos")

    # Filtro opcional para limitar número de produtos
    top_n = st.slider("Mostrar Top N Produtos", min_value=5, max_value=50, value=10)

    # Query para vendas por produto
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
            # Gráfico de barras horizontal para os produtos mais vendidos
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
            # Gráfico de dispersão para relação quantidade vs valor
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

        # Tabela com os dados
        st.subheader("Detalhes por Produto")
        st.dataframe(df.style.format({
            "Total Vendas": "{:.2f} €",
            "Preço Médio": "{:.2f} €"
        }))
    else:
        st.info("Sem dados para exibir. Tente ajustar os filtros.")

elif opcao == "👥 Vendas por Clientes":
    st.header("Análise de Vendas por Clientes")

    # Filtro opcional para limitar número de clientes
    top_n = st.slider("Mostrar Top N Clientes", min_value=5, max_value=50, value=10)

    # Query para vendas por cliente
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
            # Gráfico de barras dos principais clientes
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
            # fig1.update_xaxis(tickangle=45)
            st.plotly_chart(fig1, use_container_width=True)

        with col2:
            # Gráfico de dispersão para frequência vs valor médio
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

        # Tabela com os dados
        st.subheader("Detalhes por Cliente")
        # Mask email for privacy
        df["Email"] = df["Email"].apply(lambda x: x.split("@")[0][:3] + "***@" + x.split("@")[1])
        st.dataframe(df.style.format({
            "Total Compras": "{:.2f} €",
            "Valor Médio": "{:.2f} €"
        }))
    else:
        st.info("Sem dados para exibir. Tente ajustar os filtros.")

elif opcao == "📅 Vendas por Datas":
    st.header("Análise de Vendas por Período")

    # Selecionar granularidade
    granularity = st.radio("Selecione a Granularidade", ["Diário", "Mensal", "Anual"])

    # Construir a query com base na granularidade
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

    # Query para vendas por data
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
            # Gráfico de linha para evolução das vendas ao longo do tempo
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
            # Gráfico de barras para número de transações
            fig2 = px.bar(
                df,
                x="Período",
                y="Número Transações",
                title=f"Número de Transações ({granularity})",
                color="Valor Médio",
                labels={"Número Transações": "Quantidade", "Valor Médio": "Valor Médio (€)"}
            )
            st.plotly_chart(fig2, use_container_width=True)

        # Métricas de resumo
        total_period = df["Total Vendas"].sum()
        avg_period = df["Total Vendas"].mean()
        max_period = df["Total Vendas"].max()
        max_period_time = df.loc[df["Total Vendas"].idxmax()]["Período"]

        col1, col2, col3 = st.columns(3)
        col1.metric("Total de Vendas no Período", f"{total_period:.2f} €")
        col2.metric(f"Média de Vendas por {granularity if granularity != 'Mensal' else 'Mês'}", f"{avg_period:.2f} €")
        col3.metric(f"Melhor {granularity if granularity != 'Mensal' else 'Mês'}", f"{max_period:.2f} € ({max_period_time})")

        # Tabela com os dados
        st.subheader(f"Detalhes por {granularity}")
        st.dataframe(df.style.format({
            "Total Vendas": "{:.2f} €",
            "Valor Médio": "{:.2f} €"
        }))
    else:
        st.info("Sem dados para exibir. Tente ajustar os filtros.")

elif opcao == "🔍 Visão Analítica":
    st.header("Visão Analítica Multidimensional")

    # Permitir ao usuário selecionar dimensões
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

    # Mapear seleção para parâmetros da consulta
    dim_map = {
        "Loja": ("st.name", "d_stores st ON s.store_id = st.id"),
        "Produto": ("p.name", "d_products p ON s.product_id = p.id"),
        "Cliente": ("c.name", "d_customers c ON s.customer_id = c.id"),
        "Tipo de Documento": ("dt.name", "d_document_types dt ON s.document_type_id = dt.id"),
        "Data (Mês)": ("TO_CHAR(MAKE_DATE(d.year, d.month, 1), 'MM/YYYY')", "d_dates d ON s.date_id = d.id"),
        "Data (Ano)": ("d.year::text", "d_dates d ON s.date_id = d.id")
    }

    # Construir query dinamicamente
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

    # Ajustar joins para evitar duplicações
    joins = f"""
    JOIN {join_dim1}
    {f'JOIN {join_dim2}' if join_dim2 else ''}
    """

    # Query final para análise multidimensional
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
        # Visualizações baseadas nas dimensões selecionadas
        if dim2 != "Nenhuma" and dim2 != dim1:
            # Gráfico de calor para duas dimensões
            fig1 = px.treemap(
                df,
                path=[dim1, dim2],
                values="Total Vendas",
                color="Total Vendas",
                title=f"Análise de Vendas por {dim1} e {dim2}",
                hover_data=["Num. Transações", "Quantidade"]
            )
            st.plotly_chart(fig1, use_container_width=True)

            # Tabela pivotada
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
            # Gráfico de barras para uma dimensão
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
            # fig1.update_xaxis(tickangle=45)
            st.plotly_chart(fig1, use_container_width=True)

        # Resumo estatístico
        st.subheader("Resumo Estatístico")
        st.dataframe(df.describe().style.format("{:.2f}"))

        # Download de dados
        csv = df.to_csv(index=False).encode('utf-8')
        st.download_button(
            "Baixar Dados (CSV)",
            data=csv,
            file_name=f"analise_{dim1.lower()}_{dim2.lower() if dim2 != 'Nenhuma' else 'sem_dim2'}.csv",
            mime='text/csv',
        )
    else:
        st.info("Sem dados para exibir. Tente ajustar os filtros.")

# Adicionar informação de rodapé
st.markdown("---")
st.markdown(
    """
    <div style='text-align: center; color: gray; font-size: 14px;'>
        OLAP - Gestão de Vendas | Desenvolvido com Streamlit | Dados em PostgreSQL
    </div>
    """,
    unsafe_allow_html=True
)
