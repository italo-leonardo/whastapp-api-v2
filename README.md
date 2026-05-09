# WhatsApp API + n8n Integration

API simples desenvolvida com `whatsapp-web.js` para integração com o n8n, permitindo:

* Envio de mensagens via WhatsApp
* Recebimento de mensagens em tempo real
* Integração com Webhooks do n8n
* Automação de cobranças e notificações
* Base para criação de bots e fluxos inteligentes

---

# Tecnologias Utilizadas

* Node.js
* Express
* whatsapp-web.js
* Axios
* qrcode-terminal
* n8n

---

# Estrutura do Projeto

```bash
project/
│
├── index.js
├── package.json
├── .wwebjs_auth/
├── .wwebjs_cache/
└── README.md
```

---

# Instalação

## 1. Clone o projeto

```bash
git clone https://github.com/seu-usuario/seu-repositorio.git
```

---

## 2. Acesse a pasta

```bash
cd seu-repositorio
```

---

## 3. Instale as dependências

```bash
npm install
```

---

# Dependências Necessárias

```bash
npm install whatsapp-web.js express axios qrcode-terminal
```

---

# Executando a API

```bash
node index.js
```

Ao executar:

* Um QR Code será exibido no terminal
* Escaneie utilizando o WhatsApp
* Após autenticação aparecerá:

```bash
✅ WhatsApp conectado!
```

---

# Endpoint de Envio

## POST /send

Responsável por enviar mensagens via WhatsApp.

### URL

```bash
http://localhost:3000/send
```

---

## Body JSON

```json
{
  "numero": "55889999999",
  "mensagem": "Olá, sua cobrança vence amanhã."
}
```

---

## Resposta de Sucesso

```json
{
  "status": "enviado"
}
```

---

# Integração com n8n

A API pode receber mensagens do n8n utilizando o node:

* HTTP Request

## Configuração do Node HTTP Request

### Método

```bash
POST
```

### URL

```bash
http://localhost:3000/send
```

### Body JSON

```json
{
  "numero": "{{ $json.telefone }}",
  "mensagem": "Olá {{ $json.nome }}, seu aluguel vence em breve."
}
```

---

# Recebimento de Mensagens

A API também envia mensagens recebidas do WhatsApp para o n8n utilizando Webhook.

---

# Configuração do Webhook no n8n

Crie um node:

* Webhook

## Método

```bash
POST
```

## Exemplo de URL

```bash
http://localhost:5678/webhook-test/seu-id
```

---

# Dados Recebidos no n8n

```json
{
  "numero": "5588999999999@c.us",
  "nome": "Teste API",
  "mensagem": "Olá"
}
```

---

# Fluxo de Automação Utilizado

```text
Google Sheets → Merge → Code → IF → HTTP Request → WhatsApp
```

---

# Casos de Uso

* Cobrança automática
* Lembrete de vencimento
* Notificações automáticas
* Bot de atendimento
* Integração com CRM
* Integração com IA

---

# Observações Importantes

## Sessão do WhatsApp

As pastas abaixo armazenam sessão e cache:

```bash
.wwebjs_auth
.wwebjs_cache
```

Caso ocorram erros estranhos:

* delete ambas as pastas
* reinicie a aplicação
* escaneie o QR Code novamente

---

# Possíveis Erros

## Número inválido

Verifique se o número possui:

* Código do país
* DDD
* WhatsApp ativo

Exemplo correto:

```bash
5588999999999
```

---

## QR Code não aparece

Apague:

```bash
.wwebjs_auth
.wwebjs_cache
```

E execute novamente:

```bash
node index.js
```

---

# Melhorias Futuras

* Painel administrativo
* Multiusuário
* Integração com IA
* Logs de mensagens
* Fila de envio
* Integração com banco de dados
* Dashboard de cobranças

---

# Licença

Projeto para fins educacionais e automações privadas.

---

# Autor

Desenvolvido por Italo Leonardo.
