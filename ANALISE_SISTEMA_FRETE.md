# 📦 ANÁLISE DO SISTEMA DE FRETE E ENVIO

**Data da Análise:** 06/09/2026  
**Sistema:** SellControl - Módulo de Envios Automatizados

---

## ✅ O QUE JÁ ESTÁ IMPLEMENTADO

### 1. 🗄️ BANCO DE DADOS

#### Tabelas Criadas (Migration: `20260731_create_sistema_envios.sql`)

- **`enderecos_clientes`** ✅
  - Armazena endereços de entrega dos clientes
  - Suporta múltiplos endereços por cliente
  - Campo `padrao` para endereço principal
  - Integração com ViaCEP para busca automática

- **`romaneios`** ✅
  - Consolidação de sacolinhas para envio
  - Dimensões do pacote (peso, altura, largura, comprimento)
  - Status do envio (preparando → pronto → frete_cotado → frete_pago → etiqueta_gerada → despachado → entregue)
  - Rastreamento e dados do Melhor Envio

- **`romaneio_sacolinhas`** ✅
  - Relacionamento N:N entre romaneios e sacolinhas
  - Rastreabilidade de quais sacolinhas estão em cada pacote

- **`cotacoes_frete`** ✅
  - Armazena cotações do Melhor Envio
  - Opções de transportadoras (PAC, SEDEX, etc)
  - Valores e prazos de entrega

- **`pagamentos_frete`** ✅
  - Pagamentos via PIX (Mercado Pago)
  - QR Code e link de pagamento
  - Controle de status (pendente, aprovado, recusado, cancelado)

#### Funções SQL
- `gerar_numero_romaneio(p_tenant_id)` ✅ - Gera números sequenciais (ROM-001, ROM-002...)

---

### 2. 🎨 PORTAL DO CLIENTE

#### Páginas Implementadas

**`src/pages/portal/MeusEnderecos.jsx`** ✅
- Cadastro completo de endereços
- Busca automática de CEP via ViaCEP
- Marcar endereço como padrão
- Editar/Excluir endereços
- Validação completa de campos obrigatórios

**`src/pages/portal/MeuFrete.jsx`** ✅
- Lista romaneios prontos para envio
- Seleção de endereço de entrega
- Cotação de frete (integração Melhor Envio)
- Escolha da transportadora (PAC, SEDEX, etc)
- Geração de PIX para pagamento
- Exibição de QR Code
- Acompanhamento de status
- Lista de produtos do romaneio com totais

**Navegação Portal** ✅
- Rotas configuradas em `PortalDashboard.jsx`
- Abas "🚚 Frete" e "📍 Endereços" funcionais

---

### 3. 👨‍💼 SISTEMA INTERNO (Funcionários)

**`src/pages/etiquetas/EtiquetasPage.jsx`** ✅
- Lista romaneios com frete pago
- Gerar etiqueta de envio (Melhor Envio)
- Imprimir etiqueta (PDF)
- Marcar como despachado
- Visualização de endereço de entrega
- Código de rastreio

**Rota Configurada** ✅
- `/etiquetas-envio` em `App.jsx`

---

### 4. 🔧 SERVIÇOS (Integrações)

#### `src/services/melhorEnvioService.js` ✅
Funções implementadas:
- `calcularFrete()` - Cotação de frete
- `salvarCotacoes()` - Salva opções no banco
- `buscarCotacoes()` - Recupera cotações salvas
- `comprarEtiqueta()` - Compra etiqueta (após pagamento)
- `gerarEtiqueta()` - Gera etiqueta de envio
- `imprimirEtiqueta()` - Retorna URL do PDF
- `rastrearEnvio()` - Rastreamento
- `atualizarRomaneioComFrete()` - Atualiza dados do romaneio
- `marcarFretePago()` - Marca como pago

**Cache de Token:** 5 minutos TTL

#### `src/services/mercadoPagoService.js` ✅
Funções implementadas:
- `criarPagamentoPIX()` - Cria pagamento PIX e salva no banco
- `consultarPagamento()` - Consulta status no MP
- `buscarPagamentoRomaneio()` - Busca pagamento do banco
- `atualizarStatusPagamento()` - Atualiza status (aprovado/recusado)
- `verificarPagamentosPendentes()` - Verifica pagamentos pendentes
- `processarWebhook()` - Processa notificações do MP

**Cache de Token:** 5 minutos TTL

#### `src/services/pedidosService.js` ✅
Funções relacionadas a romaneio:
- `criarRomaneioComDimensoes()` - Cria romaneio com peso/dimensões
- `atualizarDimensoesRomaneio()` - Atualiza dimensões
- `calcRomaneioTotal()` - Calcula total do romaneio
- `atribuirRomaneio()` - Atribui número de romaneio
- `adicionarSeparadosAoRomaneio()` - Adiciona itens separados

---

### 5. ⚙️ CONFIGURAÇÕES

**Campos na tabela `configuracoes`:**
- `token_melhor_envio` ✅ - Token da API do Melhor Envio
- `melhor_envio_api_url` ✅ - URL da API (sandbox/produção)
- `mp_access_token` ✅ - Token do Mercado Pago

**Página de Configurações** ✅
- Formulário para configurar ambos os tokens
- Modo Manual/Código de Barras
- Seleção de ambiente Melhor Envio (Sandbox/Produção)

---

## ⚠️ O QUE FALTA IMPLEMENTAR / VERIFICAR

### 🔴 CRÍTICO

#### 1. **Automatização de Criação de Romaneios**
**Problema:** Quando o funcionário marca pedido como "Pronto" na produção, o romaneio não é criado automaticamente na nova tabela `romaneios`.

**Situação Atual:**
- Tabela `producao_pedidos` tem coluna `romaneio` (INTEGER)
- Tabela `romaneios` tem coluna `numero` (TEXT) tipo "ROM-001"
- Não há trigger/função automática conectando as duas

**Solução Necessária:**
- Criar trigger ou função que ao atualizar `status_prod = 'Pronto'` na `producao_pedidos`:
  - Cria registro na tabela `romaneios` com status 'pronto'
  - Pega dimensões (peso, altura, largura, comprimento) se disponíveis
  - Associa cliente_instagram
  - Retorna número do romaneio

#### 2. **Webhook do Mercado Pago**
**Problema:** Não existe endpoint para receber notificações de pagamento do Mercado Pago.

**Situação Atual:**
- Função `processarWebhook()` existe no `mercadoPagoService.js`
- Mas não há endpoint/API configurado

**Solução Necessária:**
- Criar arquivo `api/mercadopago-webhook.js` (Vercel Serverless)
- Configurar URL do webhook no painel do Mercado Pago
- Processar notificações de pagamento aprovado/recusado
- Atualizar status do romaneio automaticamente

#### 3. **Sincronização Bidirecional**
**Problema:** Mudanças em `romaneios` não refletem em `producao_pedidos` e vice-versa.

**Casos:**
- Cliente paga frete → deve aparecer indicador na tela de Produção
- Funcionário marca como despachado → deve atualizar status_entrega em producao_pedidos

**Solução Necessária:**
- Criar trigger/função de sincronização
- Atualizar view de produção para mostrar ícone de frete pago (já existe código comentado)

---

### 🟡 IMPORTANTE

#### 4. **Notificações ao Cliente**
**Sugestão:** Cliente ser notificado quando romaneio fica pronto para cotar frete.

**Possível Implementação:**
- Criar notificação na tabela `notificacoes`
- Ou enviar WhatsApp/Email automático
- Usar sistema de notificações já existente do portal

#### 5. **Campo de Dimensões na Produção**
**Observação:** Modal de detalhes (`DetalheModal.jsx`) tem campo "Peso" mas falta altura, largura, comprimento.

**Solução:**
- Adicionar campos de dimensões no modal
- Permitir funcionário informar ao marcar como pronto

#### 6. **Integração com Página de Expedição**
**Verificar:** A página `PedidosPage.jsx` (Expedição) já tem lógica de romaneio, mas precisa verificar se está integrada com nova tabela.

---

### 🟢 MELHORIAS / FUTURO

#### 7. **Rastreamento Automático**
- Pooling/webhook do Melhor Envio para atualizar status de rastreio
- Notificar cliente quando pedido for entregue

#### 8. **Relatório de Envios**
- Dashboard de envios (total por mês, transportadora mais usada, etc)
- Gráficos de custos de frete

#### 9. **Multi-Endereço no Romaneio**
- Permitir envios para endereços diferentes do mesmo cliente
- Dividir romaneio por endereço de entrega

#### 10. **Estorno/Cancelamento**
- Fluxo de cancelamento de frete pago
- Estorno do PIX (se aplicável)

---

## 🔍 VERIFICAÇÕES PENDENTES

### Checklist de Testes

- [ ] Testar cadastro de endereço no portal
- [ ] Testar busca de CEP
- [ ] Criar romaneio manualmente via função SQL
- [ ] Verificar se cotação de frete funciona (precisa token válido)
- [ ] Testar geração de PIX (precisa token MP válido)
- [ ] Verificar se QR Code aparece corretamente
- [ ] Testar fluxo completo: endereço → cotação → pagamento → etiqueta
- [ ] Verificar permissões RLS (Row Level Security) de todas as tabelas
- [ ] Testar com múltiplos tenants
- [ ] Verificar se página de etiquetas lista romaneios corretamente

---

## 📋 CONFIGURAÇÃO NECESSÁRIA PARA TESTAR

### 1. Melhor Envio
1. Criar conta em https://sandbox.melhorenvio.com.br
2. Gerar token de acesso
3. Configurar em `/configuracoes` no sistema

### 2. Mercado Pago
1. Criar conta em https://www.mercadopago.com.br/developers
2. Obter Access Token (sandbox para testes)
3. Configurar em `/configuracoes` no sistema
4. (Futuro) Configurar webhook URL

### 3. Endereço de Origem
**Hardcoded em `MeuFrete.jsx` linha 98:**
```javascript
const enderecoOrigem = {
  postal_code: '13560340',
  address: 'Rua Antonio Bueno de Camargo',
  number: '295',
  district: 'Centro',
  city: 'São Carlos',
  state_abbr: 'SP',
}
```

**AÇÃO:** Mover para tabela `configuracoes` ou criar tabela `enderecos_empresa`.

---

## 🎯 ORDEM SUGERIDA DE IMPLEMENTAÇÃO

### FASE 1 - Conectar Sistema Existente (URGENTE)
1. Criar trigger/função para criação automática de romaneio
2. Sincronizar status entre `romaneios` e `producao_pedidos`
3. Adicionar campos de dimensões no modal de produção

### FASE 2 - Webhook e Automação
4. Criar endpoint de webhook do Mercado Pago
5. Configurar verificação periódica de pagamentos pendentes
6. Implementar notificações ao cliente

### FASE 3 - Melhorias
7. Mover endereço de origem para configurações
8. Adicionar relatórios e dashboards
9. Implementar rastreamento automático

---

## 🐛 POSSÍVEIS BUGS / ATENÇÃO

1. **Conversão de Número de Romaneio:**
   - `romaneios.numero` = "ROM-001" (TEXT)
   - `producao_pedidos.romaneio` = 1 (INTEGER)
   - `vendas.numero_pedido` = 1 (INTEGER)
   - **Garantir conversão consistente em todas as funções**

2. **Cache de Tokens:**
   - TTL de 5 minutos pode ser curto/longo dependendo do uso
   - Verificar se cache funciona corretamente com múltiplos tenants

3. **Segurança:**
   - Tokens salvos em plain text no banco
   - Avaliar criptografia para tokens sensíveis

4. **RLS (Row Level Security):**
   - Todas as tabelas têm RLS habilitado
   - Verificar se policies permitem acesso correto ao portal

---

## 📝 OBSERVAÇÕES FINAIS

### Sistema Bem Estruturado ✅
O código está bem organizado, com separação clara de responsabilidades:
- Serviços isolados para cada integração
- Componentes modulares
- Migrations bem documentadas

### Próximos Passos Recomendados:
1. **Implementar FASE 1** para conectar tudo
2. **Testar fluxo completo** com dados reais
3. **Configurar tokens** de sandbox para ambiente de testes
4. **Documentar** processo para equipe

### Riscos:
- Sem webhook, sistema depende de verificação manual/periódica de pagamentos
- Cliente pode pagar e não ser atualizado automaticamente
- Funcionário pode não saber quando frete foi pago

---

**Desenvolvido por:** Claude Sonnet 4.5  
**Revisão:** Necessária após implementação das correções
