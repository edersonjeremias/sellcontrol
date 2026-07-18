# SellControl - Guia do Projeto

Este documento serve como referência central para a arquitetura, padrões e tecnologias utilizadas no projeto SellControl.

## 🚀 Stack Tecnológica
- **Frontend:** React 18 (Vite)
- **Backend/BaaS:** Supabase (PostgreSQL, Auth, RLS)
- **Roteamento:** React Router DOM v6
- **Estado Global:** React Context API (`AuthContext`, `AppContext`)

## 🏗️ Arquitetura e Multi-tenancy
O SellControl é um sistema SaaS multi-tenant.
- **Isolamento de Dados:** Cada tabela contém uma coluna `tenant_id`.
- **Segurança (RLS):** O Supabase Row Level Security (RLS) garante que os usuários só acessem dados de seu próprio `tenant_id`.
- **Perfis e Papéis:** A tabela `users_perfil` estende os usuários do Supabase Auth, definindo papéis como `master`, `admin` e `usuario`.

## 📁 Estrutura de Pastas
- `src/components/`: Componentes React.
    - `ui/`: Componentes genéricos e reutilizáveis (modais, toasts, inputs).
    - `vendas/`: Componentes específicos do módulo de vendas.
- `src/context/`: Provedores de contexto para estado global.
- `src/lib/`: Configurações de bibliotecas externas (ex: cliente Supabase).
- `src/pages/`: Componentes de página (rotas principais).
- `src/services/`: Toda a lógica de comunicação com o Supabase e regras de negócio complexas.
- `supabase/`: Scripts SQL, migrations e Edge Functions.

## 🛠️ Padrões de Desenvolvimento
1. **Lógica Separada da UI:** Nunca chame o cliente do Supabase diretamente nos componentes de página ou UI. Utilize sempre os arquivos em `src/services/`.
2. **Nomenclatura:**
    - Entidades de banco de dados e regras de negócio geralmente em Português (ex: `vendas`, `clientes`, `producao`).
    - Estrutura de código e componentes React seguem convenções em Inglês (ex: `VendasPage`, `useAuth`, `AuthContext`).
3. **Autenticação:** As rotas são protegidas pelos componentes `RequireAuth` e `RequireRole` definidos no `AuthContext`.
4. **Tratamento de Erros:** Utilize o `showGlobalToast` do `AppContext` para feedback consistente ao usuário.

## 📜 Principais Entidades (Database)
- `tenants`: Empresas cadastradas.
- `vendas`: Registros de vendas, frequentemente associados a "Lives".
- `clientes`: Identificados principalmente pelo handle do Instagram.
- `producao_pedidos`: Controle de fluxo de entrega/produção.

## 💻 Comandos Úteis
- `npm run dev`: Inicia o servidor de desenvolvimento.
- `npm run build`: Gera o build de produção.
- `npm run preview`: Visualiza o build localmente.

---
*Este arquivo deve ser atualizado conforme a arquitetura evolui.*

- Sempre responda em português do Brasil.
- Os comentários no código gerado também devem ser em português.
