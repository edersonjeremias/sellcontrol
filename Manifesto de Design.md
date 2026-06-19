# Manifesto de Design (Style Guide) - VM Kids Billing System

Este documento define as diretrizes estéticas, paleta de cores, comportamento de UI/UX e especificações de componentes do sistema de cobrança. O objetivo é manter um visual "Premium Dark Mode" (estilo aplicativo nativo) em qualquer nova implementação (ex: migração para React/Tailwind/Vite).

## 1. Tech Stack & Assets Base
* **CSS Framework Base:** Bootstrap 5.3.0 (ou utilitários equivalentes em Tailwind CSS).
* **Ícones:** FontAwesome 6.0.0.
* **Tipografia:** `system-ui, -apple-system, sans-serif`.
* **Tamanho Base da Fonte:** `0.85rem` (body), `0.95rem` (inputs/buttons).

## 2. Paleta de Cores (Super Dark Theme)
A interface não possui contrastes agressivos entre o fundo da tela e as janelas sobrepostas, criando uma imersão de app nativo.
* **Background Geral (Body & Modals):** `#121212`
* **Background de Superfícies (Navbar):** `#1a1a1a`
* **Background de Elementos (Cards, Inputs, Toasts, Caixas de Destaque):** `#1e1e1e`
* **Background Hover de Elementos:** `#252525`
* **Bordas e Divisórias:** `#2a2a2a` ou `#333333`
* **Texto Principal:** `#ffffff` ou `#e0e0e0`
* **Texto Secundário (Muted, Labels, Placeholders):** `#6c757d` ou `#adb5bd`
* **Cor de Foco/Highlight Principal:** Cyan/Info (`#0dcaf0`)

## 3. Cores de Status (Semântica)
Utilizadas nas bordas esquerdas dos cards e nos badges/ícones:
* **PAGO (Sucesso):** `#198754` (Verde)
* **ENVIADO (Info):** `#0dcaf0` (Cyan)
* **REENVIADO (Destaque):** `#6610f2` (Roxo/Indigo)
* **LEMBRETE (Aviso):** `#ffc107` (Amarelo)
* **PENDENTE (Neutro):** `#6c757d` (Cinza)
* **CANCELADO (Perigo):** `#dc3545` (Vermelho)

## 4. UI/UX Global Regras
* **Barra de Rolagem Invisível:** A rolagem deve funcionar, mas a barra (scrollbar) deve estar oculta.
    * CSS: `::-webkit-scrollbar { width: 0px; background: transparent; } body { -ms-overflow-style: none; scrollbar-width: none; }`
* **Sticky Header Inteligente:** A barra superior de filtros e métricas deve ser `position: sticky; top: 0; z-index: 1040` **apenas** em telas de desktop (`min-width: 768px`). Em mobile, ela deve rolar normalmente junto com a página para economizar espaço de tela.

## 5. Especificações de Componentes

### 5.1. Inputs, Selects e Campos de Texto
* **Background:** `#1e1e1e`
* **Border:** `1px solid #333333`
* **Border Radius:** `8px`
* **Padding (Altura Padronizada):** `12px 15px`
* **Cor do Texto:** `#ffffff`
* **Focus State:** Remove o `box-shadow` padrão do Bootstrap. Background muda para `#252525` e Borda muda para `#0dcaf0`.
* **Autocomplete do Navegador:** Forçar reset de fundo para manter o tema escuro: `input:-webkit-autofill { -webkit-box-shadow: 0 0 0 30px #2b2b2b inset !important; -webkit-text-fill-color: white !important; }`

### 5.2. Botões (Buttons)
* Devem ter **exatamente a mesma altura** dos Inputs para formar grupos (Input Groups) visualmente perfeitos.
* **Padding:** `12px 15px`
* **Font Weight:** `600` (Semi-bold)
* **Border Radius:** `8px`
* **Display:** `inline-flex` (alinhamento perfeito entre ícones FontAwesome e o texto, com `gap: 8px`).

### 5.3. Cards (Lista de Cobranças)
* **Background:** `#1e1e1e`
* **Border Radius:** `8px`
* **Padding:** `14px`
* **Indicador de Status:** Borda esquerda espessa (`border-left: 4px solid [COR_DO_STATUS]`).
* **Hover State:** Transição suave (`transition: 0.2s`). Background clareia para `#252525`, sofre leve elevação (`transform: translateY(-1px)`) e ganha sombra sutil (`box-shadow: 0 2px 4px rgba(0,0,0,0.2)`).

### 5.4. Modals (Janelas Modais)
* **Foco Principal:** Zero contraste com o fundo.
* **Background do Content:** `#121212` (Idêntico ao Body).
* **Bordas Internas:** Separadores de Header e Footer sutis (`border-color: #2a2a2a`).
* **Comportamento Mobile:** Modais devem abrir em **tela cheia** (Fullscreen) em telas `sm-down` (celulares), agindo como uma nova "página" dentro do app.

### 5.5. Notificações (Toasts)
* **Background:** `#1e1e1e` com texto `#ffffff`.
* **Sombra/Profundidade:** Marcante para sobrepor a UI (`box-shadow: 0 8px 24px rgba(0,0,0,0.8)`).
* **Border Radius:** `8px`
* **Padding:** `16px 20px`
* **Animação:** Deve surgir de baixo para cima (`transform: translateY(20px)` para `translateY(0)` com fade in/out).