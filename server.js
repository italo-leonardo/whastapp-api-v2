// =======================
// IMPORTS
// =======================
const { Client, LocalAuth, MessageTypes } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode');
const axios = require('axios');

// =======================
// EXPRESS
// =======================
const app = express();
app.use(express.json());

// =======================
// CONFIG
// =======================
const PORT = 3000;

const N8N_WEBHOOK =
  'https://n8n.srv1709994.hstgr.cloud/webhook/fb429ae1-d3e2-4036-9fe7-e943fd5bd581';

// =======================
// ESTADO GLOBAL
// =======================
let qrCodeString = null;
let whatsappConectado = false;

// =======================
// WHATSAPP CLIENT
// =======================
const client = new Client({
  authStrategy: new LocalAuth(),

  puppeteer: {
    executablePath: '/snap/bin/chromium',

    headless: true,

    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu'
    ]
  }
});

// =======================
// EVENTOS WHATSAPP
// =======================

// QR CODE
client.on('qr', qr => {

  console.log('📲 Novo QR Code gerado');

  qrCodeString = qr;
  whatsappConectado = false;
});

// READY
client.on('ready', () => {

  console.log('✅ WhatsApp conectado!');

  whatsappConectado = true;
  qrCodeString = null;
});

// DISCONNECTED
client.on('disconnected', reason => {

  console.log('❌ WhatsApp desconectado');
  console.log('Motivo:', reason);

  whatsappConectado = false;
});

// =======================
// FUNÇÕES AUXILIARES
// =======================

function limparNumero(raw = '') {
  return raw.replace(/@.*$/, '').replace(/\D/g, '');
}

function formatarE164(digits = '') {
  return `+${digits}`;
}

async function resolverNumero(msg, contact) {

  if (contact.id?._serialized?.endsWith('@c.us')) {
    return contact.id.user;
  }

  if (msg.from?.endsWith('@c.us')) {
    return msg.from.replace('@c.us', '');
  }

  const digitos = limparNumero(contact.number || msg.from || '');

  return digitos;
}

function resolverTipo(msg) {

  const map = {
    [MessageTypes.TEXT]:               'text',
    [MessageTypes.IMAGE]:              'image',
    [MessageTypes.VIDEO]:              'video',
    [MessageTypes.AUDIO]:              'audio',
    [MessageTypes.VOICE]:              'voice',
    [MessageTypes.DOCUMENT]:           'document',
    [MessageTypes.STICKER]:            'sticker',
    [MessageTypes.LOCATION]:           'location',
    [MessageTypes.CONTACT_CARD]:       'contact',
    [MessageTypes.CONTACT_CARD_MULTI]: 'contact_multi',
    [MessageTypes.LIST]:               'list',
    [MessageTypes.BUTTONS_RESPONSE]:   'button_response',
    [MessageTypes.POLL_CREATION]:      'poll',
  };

  return map[msg.type] || msg.type || 'unknown';
}

// =======================
// RECEBER MENSAGENS
// =======================
client.on('message', async msg => {

  try {

    const contact = await msg.getContact();
    const chat    = await msg.getChat();

    const isGroup = chat.isGroup;

    // ─────────────────────
    // Número
    // ─────────────────────
    const numero = await resolverNumero(msg, contact);

    // ─────────────────────
    // Nome
    // ─────────────────────
    const nome =
      contact.pushname ||
      contact.name ||
      contact.shortName ||
      'Desconhecido';

    // ─────────────────────
    // Grupo
    // ─────────────────────
    const grupoId =
      isGroup
        ? limparNumero(chat.id._serialized)
        : null;

    const grupoNome =
      isGroup
        ? chat.name
        : null;

    // ─────────────────────
    // Payload
    // ─────────────────────
    const payload = {

      messageId:
        msg.id?.id || null,

      timestamp:
        msg.timestamp,

      timestampISO:
        new Date(msg.timestamp * 1000).toISOString(),

      numero,
      numeroE164: formatarE164(numero),

      nome,

      tipo:
        resolverTipo(msg),

      mensagem:
        msg.body || null,

      isGrupo:
        isGroup,

      grupoId,
      grupoNome,

      temMidia:
        msg.hasMedia
    };

    console.log('📩 Mensagem recebida');
    console.log(payload);

    // ─────────────────────
    // ENVIA PARA N8N
    // ─────────────────────
    await axios.post(N8N_WEBHOOK, payload);

    console.log('📡 Enviado para n8n');

  } catch (error) {

    console.error('❌ Erro ao processar mensagem');
    console.error(error.message);
  }
});

// =======================
// INICIALIZA CLIENT
// =======================
client.initialize();

// =======================
// QR CODE WEB
// =======================
app.get('/qr', async (req, res) => {

  try {

    // Já conectado
    if (whatsappConectado) {

      return res.send(`
        <html>
          <body style="
            display:flex;
            justify-content:center;
            align-items:center;
            height:100vh;
            font-family:sans-serif;
            background:#111;
            color:#fff;
          ">
            <div style="text-align:center">
              <h1>✅ WhatsApp Conectado</h1>
            </div>
          </body>
        </html>
      `);
    }

    // QR ainda não gerado
    if (!qrCodeString) {

      return res.send(`
        <html>
          <body style="
            display:flex;
            justify-content:center;
            align-items:center;
            height:100vh;
            font-family:sans-serif;
            background:#111;
            color:#fff;
          ">
            <div style="text-align:center">
              <h1>⏳ Aguardando QR Code...</h1>
            </div>
          </body>
        </html>
      `);
    }

    // Gera imagem QR
    const qrImage =
      await qrcode.toDataURL(qrCodeString);

    // HTML
    res.send(`
      <html>

        <head>
          <title>QR Code WhatsApp</title>
        </head>

        <body style="
          display:flex;
          justify-content:center;
          align-items:center;
          height:100vh;
          background:#111;
          font-family:sans-serif;
        ">

          <div style="
            background:#fff;
            padding:30px;
            border-radius:20px;
            text-align:center;
          ">

            <h2>
              📲 Escaneie o QR Code
            </h2>

            <img
              src="${qrImage}"
              width="350"
            />

          </div>

        </body>

      </html>
    `);

  } catch (error) {

    res.status(500).send(error.message);
  }
});

// =======================
// STATUS
// =======================
app.get('/status', (req, res) => {

  res.json({

    status:
      whatsappConectado
        ? 'online'
        : 'offline',

    conectado:
      whatsappConectado,

    telefone:
      client.info?.wid?._serialized || null,

    timestamp:
      new Date().toISOString()
  });
});

// =======================
// ENVIAR MENSAGEM
// =======================
app.post('/send', async (req, res) => {

  const { numero, mensagem } = req.body;

  // Validação
  if (!numero || !mensagem) {

    return res.status(400).json({
      error:
        'Campos "numero" e "mensagem" são obrigatórios'
    });
  }

  try {

    // Limpa número
    const numeroLimpo =
      numero.toString().replace(/\D/g, '');

    // Verifica número
    const numberId =
      await client.getNumberId(numeroLimpo);

    if (!numberId) {

      return res.status(404).json({
        error:
          'Número não encontrado no WhatsApp'
      });
    }

    // Envia mensagem
    const sentMsg =
      await client.sendMessage(
        numberId._serialized,
        mensagem
      );

    // Resposta
    res.json({

      status: 'enviado',

      para:
        numeroLimpo,

      messageId:
        sentMsg.id?.id || null,

      timestamp:
        new Date().toISOString()
    });

  } catch (error) {

    res.status(500).json({
      error: error.message
    });
  }
});

// =======================
// SERVER
// =======================
app.listen(PORT, () => {

  console.log(`🚀 API rodando na porta ${PORT}`);
});