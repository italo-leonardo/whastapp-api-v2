# WhatsApp API V2 + n8n

API de automação WhatsApp desenvolvida com Node.js, Express e whatsapp-web.js, integrada ao n8n para automações empresariais e fluxos financeiros.

Projeto desenvolvido inicialmente para uma imobiliária, automatizando:

- Cobrança de aluguel
- Lembretes automáticos
- Recebimento de mensagens
- Recebimento de comprovantes
- Integração com Google Sheets
- Integração com n8n
- Controle de inadimplência

---

# Tecnologias

- Node.js
- Express
- whatsapp-web.js
- Puppeteer
- PM2
- n8n
- Google Sheets
- Google Apps Script

---

# Funcionalidades

## Envio de mensagens

A API permite envio de mensagens via endpoint HTTP.

### Endpoint

```http
POST /send
```

### Exemplo

```json
{
  "numero": "5588999999999",
  "mensagem": "Olá, tudo bem?"
}
```

---

# Recebimento de mensagens

A API escuta mensagens recebidas no WhatsApp e envia automaticamente para o n8n via webhook.

Payload enviado:

```json
{
  "messageId": "xxxxx",
  "timestamp": 1710000000,
  "timestampISO": "2025-05-24T12:00:00.000Z",

  "numero": "5588999999999",
  "numeroE164": "+5588999999999",

  "nome": "Cliente",

  "tipo": "text",
  "mensagem": "Olá",

  "isGrupo": false,
  "grupoId": null,
  "grupoNome": null,

  "temMidia": false
}
```

---

# QR Code Web

A API possui rota web para autenticação do WhatsApp.

## Abrir QR Code

```http
GET /qr
```

Abra no navegador:

```text
http://localhost:3000/qr
```

---

# Status da API

## Endpoint

```http
GET /status
```

## Retorno

```json
{
  "status": "online",
  "conectado": true,
  "telefone": "5588999999999@c.us",
  "timestamp": "2025-05-24T14:00:00.000Z"
}
```

---

# Instalação

## Clonar projeto

```bash
git clone https://github.com/italo-leonardo/whastapp-api-v2.git
```

---

## Entrar na pasta

```bash
cd whastapp-api-v2
```

---

## Instalar dependências

```bash
npm install
```

---

# Dependências principais

```bash
npm install express
npm install axios
npm install qrcode
npm install qrcode-terminal
npm install whatsapp-web.js
```

---

# Rodar projeto

```bash
node server.js
```

---

# PM2

## Instalar PM2

```bash
npm install -g pm2
```

---

## Iniciar API

```bash
pm2 start server.js --name whatsapp-api
```

---

## Ver processos

```bash
pm2 list
```

---

## Logs

```bash
pm2 logs whatsapp-api
```

---

## Reiniciar

```bash
pm2 restart whatsapp-api
```

---

## Parar

```bash
pm2 stop whatsapp-api
```

---

# Estrutura do Projeto

```text
whatsapp-api-v2/
│
├── node_modules/
├── .wwebjs_auth/
├── .wwebjs_cache/
├── package.json
├── package-lock.json
├── .gitignore
├── README.md
└── server.js
```

---

# Fluxo com n8n

O projeto foi integrado ao n8n para automações financeiras.

Fluxos atuais:

- Cobrança automática de aluguel
- Verificação de inadimplência
- Lembrete antes do vencimento
- Ajustes financeiros automáticos
- Integração com Google Sheets
- Recebimento de comprovantes
- Baixa automática futura

---

# Segurança

A pasta:

```text
.wwebjs_auth/
```

NÃO deve ser enviada para o GitHub.

Ela contém:
- sessão do WhatsApp
- autenticação
- tokens locais

---

# Produção

Projeto preparado para:
- Linux
- VPS
- PM2
- Docker (futuramente)
- Nginx (futuramente)

---

# Roadmap

## Próximas melhorias

- Multi sessão
- Multi clientes
- Upload de mídia
- Reconexão automática avançada
- Painel administrativo
- Banco PostgreSQL
- Docker
- Logs persistentes
- Retry automático
- Controle de fila
- Webhooks avançados

---

# Autor

Italo Leonardo

GitHub:
https://github.com/italo-leonardo

LinkedIn:
https://www.linkedin.com/in/italo-leonardo-coelho-oliveira-9a33001bb/