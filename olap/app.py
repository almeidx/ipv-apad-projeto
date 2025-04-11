import streamlit as st
import pandas as pd
import matplotlib.pyplot as plt

st.set_page_config(
    page_title="OLAP - Gestão de Vendas",
    layout="wide",
    initial_sidebar_state="expanded"
)

st.markdown("""
    <style>
        h1 {
            font-family: 'Segoe UI', sans-serif;
            color: #2E86C1;
            font-size: 48px;
        }

        /* Sidebar */
        .css-1d391kg, .css-1v0mbdj {
            background-color: #f5f7fa;
        }

        /* Título da sidebar */
        .css-hyum1k {
            color: #2E86C1;
            font-size: 24px;
            font-weight: bold;
        }

        /* Corpo geral */
        .block-container {
            padding-top: 2rem;
            padding-bottom: 2rem;
            padding-left: 3rem;
            padding-right: 3rem;
        }

        /* Radio buttons */
        .stRadio > div {
            flex-direction: column;
        }
    </style>
""", unsafe_allow_html=True)

st.markdown("<h1 style='text-align: center;'>📊 OLAP - Gestão de Vendas</h1>", unsafe_allow_html=True)

st.sidebar.title("📌 Menu")
opcao = st.sidebar.radio("Seleciona a opção:", ["🏠 Visão Geral", "📦 Análise por Produto", "ℹ️ Sobre o Projeto"])
