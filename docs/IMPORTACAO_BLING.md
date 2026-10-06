# 📦 Importação de Clientes do Bling

## 🎯 Objetivo

Importar clientes completos do Bling para o SellControl, criando automaticamente:
- **Cliente completo** com nome, CPF/CNPJ, email, telefone
- **Endereço padrão** vinculado ao cliente
- Dados unificados entre portal e área administrativa

## 📋 Pré-requisitos

### 1. Aplicar Migration

Execute a migration SQL no Supabase Dashboard (SQL Editor):

```sql
-- Copie e execute o conteúdo do arquivo:
-- supabase/migrations/20260802_expandir_clientes_para_bling.sql
```

### 2. Exportar dados do Bling

No Bling, exporte os clientes em formato CSV com as seguintes colunas:

**Obrigatórias:**
- Nome (ou Razão Social)
- Código (será usado como @instagram)

**Opcionais mas recomendadas:**
- CNPJ / CPF
- Tipo pessoa (Pessoa Física ou Pessoa Jurídica)
- Celular
- Fone (telefone fixo)
- E-mail
- CEP
- Endereço (rua)
- Número
- Complemento
- Bairro
- Cidade
- UF

**Formato:** CSV com separador **ponto-e-vírgula (;)**

## 🚀 Como Usar

### Passo 1: Acessar a Importação

1. Faça login como **MASTER**
2. Vá em **Master → Empresas**
3. Clique na aba **"Importar Bling"**

### Passo 2: Selecionar Empresa

Escolha a empresa de destino onde os clientes serão importados.

### Passo 3: Fazer Upload do CSV

1. Clique em "Escolher arquivo"
2. Selecione o CSV exportado do Bling
3. Aguarde o preview carregar

### Passo 4: Revisar Preview

O preview mostrará:
- Nome do cliente
- Instagram (@codigo ou @nome)
- CPF/CNPJ
- Cidade
- ✓ se tem endereço completo

### Passo 5: Importar

Clique em **"Importar X clientes"** e aguarde a conclusão.

## 📊 O que é Criado

Para cada linha do CSV:

### Cliente (tabela `clientes`)
```javascript
{
  instagram: '@codigo',           // Código do Bling ou nome
  nome_completo: 'Nome Completo', // Nome ou Razão Social
  cpf_cnpj: '00000000000',        // Limpo, só números
  tipo_pessoa: 'fisica',          // 'fisica' ou 'juridica'
  whatsapp: '11900000000',        // Celular limpo
  telefone: '1130000000',         // Fone fixo limpo
  email: 'email@exemplo.com',     // Email em lowercase
  data_cadastro: '2026-08-02',
  bloqueado: false
}
```

### Endereço (tabela `enderecos_clientes`)
```javascript
{
  cliente_instagram: '@codigo',
  apelido: 'Principal',           // Ou Fantasia
  destinatario: 'Nome Completo',
  telefone: '11900000000',
  cep: '00000000',               // Limpo, só números
  rua: 'Rua Exemplo',
  numero: '123',
  complemento: 'Apto 1',
  bairro: 'Centro',
  cidade: 'São Paulo',
  estado: 'SP',
  padrao: true
}
```

## ✅ Comportamento

### Clientes Existentes
- Se o `instagram` já existir → **atualiza** os dados
- Se o endereço já existir → **atualiza** o endereço

### Clientes Novos
- Cria cliente novo
- Cria endereço (se tiver CEP completo)

### Validações
- **Pula** linhas sem nome
- **Pula** linhas sem código/instagram
- **Cria cliente** mesmo sem endereço
- **Não cria endereço** se faltar CEP/Cidade/Estado

## 📈 Resultados

Ao final da importação você verá:

- ✅ **Novos**: clientes criados
- 🔄 **Atualizados**: clientes existentes atualizados
- ⏭️ **Pulados**: linhas inválidas
- ❌ **Erros**: falhas na importação

### Baixar Erros
Clique em **"📥 Baixar CSV dos Erros"** para ver:
- Linha do CSV
- Instagram
- Mensagem de erro
- Detalhes técnicos

## 🔗 Onde os Dados Aparecem

### 1. Portal do Cliente
- Em **Meus Endereços** (para cotação de frete)
- Usado automaticamente em **Etiquetas de Envio**

### 2. Área Administrativa
- Em **Clientes** → modal "Dados para Envio"
- Funcionários podem editar dados do cliente
- Cadastro unificado

## 🎨 Exemplo de CSV do Bling

```csv
ID;Código;Nome;Fantasia;Endereço;Número;Complemento;Bairro;CEP;Cidade;UF;Celular;Fone;E-mail;Tipo pessoa;CNPJ / CPF
001;@cliente1;João da Silva;;Rua Exemplo;123;Apto 1;Centro;01000000;São Paulo;SP;11900000000;1130000000;joao@email.com;Pessoa Física;00000000000
002;@cliente2;Maria Ltda;Maria Store;Av Principal;456;;Jardim;02000000;São Paulo;SP;11911111111;;maria@loja.com;Pessoa Jurídica;00000000000100
```

## ⚠️ Observações Importantes

1. **Separador**: O CSV do Bling usa **ponto-e-vírgula (;)** como separador
2. **Encoding**: UTF-8 com BOM (padrão do Bling)
3. **Instagram**: Se o campo "Código" estiver vazio, usa o Nome como base
4. **Telefone**: O sistema aceita Celular OU Fone, prioriza Celular para WhatsApp
5. **Endereço**: Só cria se tiver CEP + Cidade + Estado completos

## 🔧 Solução de Problemas

### "Instagram vazio"
- Verifique se a coluna "Código" ou "Nome" está preenchida
- O sistema cria @instagram automaticamente do nome se não houver código

### "Erro ao inserir"
- Baixe o CSV de erros
- Verifique caracteres especiais no nome/endereço
- Confirme que o CPF/CNPJ está válido

### "Nenhum endereço criado"
- Verifique se o CSV tem as colunas: CEP, Cidade, UF
- CEP precisa estar completo (8 dígitos)
- Estado precisa ser sigla (SP, RJ, MG)

## 📞 Suporte

Em caso de dúvidas ou problemas:
1. Verifique o preview antes de importar
2. Baixe o CSV de erros para diagnóstico
3. Teste com poucos clientes primeiro
4. Entre em contato com o suporte técnico

---

**Última atualização**: 06/10/2026  
**Versão**: 1.0.0
