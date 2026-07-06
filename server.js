// =======================
// IMPORTS
// =======================
const { Client, LocalAuth, MessageTypes } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// =======================
// DETECTA O NAVEGADOR
// =======================
let executablePath = null;
let ambiente = "LOCAL";

if (fs.existsSync('/snap/bin/chromium')) {
  executablePath = '/snap/bin/chromium';
  ambiente = "VPS";
}
else if (fs.existsSync('/usr/bin/chromium-browser')) {
  executablePath = '/usr/bin/chromium-browser';
}
else if (fs.existsSync('/usr/bin/chromium')) {
  executablePath = '/usr/bin/chromium';
}
else if (fs.existsSync('/usr/bin/google-chrome')) {
  executablePath = '/usr/bin/google-chrome';
}
else if (fs.existsSync('/usr/bin/google-chrome-stable')) {
  executablePath = '/usr/bin/google-chrome-stable';
}

console.log("=======================================");
console.log("Ambiente :", ambiente);
console.log("Browser  :", executablePath || "Automático");
console.log("=======================================");

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

const AUTH_DIR = path.join(__dirname, '.wwebjs_auth');
const CACHE_DIR = path.join(__dirname, '.wwebjs_cache');

// =======================
// ESTADO GLOBAL
// =======================
let qrCodeString = null;
let whatsappConectado = false;
let clientPronto = false;
let tentativasReconect = 0;

const MAX_TENTATIVAS = 5;

// =======================
// LIMPA SESSÃO
// =======================
function limparSessao() {

  try {

    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, {
        recursive: true,
        force: true
      });

      console.log("🧹 Sessão removida");
    }

    if (fs.existsSync(CACHE_DIR)) {
      fs.rmSync(CACHE_DIR, {
        recursive: true,
        force: true
      });

      console.log("🧹 Cache removido");
    }

  } catch (e) {

    console.error("Erro ao limpar sessão:", e.message);

  }

}

// =======================
// CRIA CLIENT
// =======================
function criarClient() {

  const argsDesktop = [
    '--disable-extensions'
  ];

  const argsVPS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--disable-gpu',
    '--no-first-run',
    '--no-zygote',
    '--single-process',
    '--disable-extensions'
  ];

  return new Client({

    authStrategy: new LocalAuth({
      dataPath: AUTH_DIR
    }),

    puppeteer: {

      executablePath,

      // Sempre headless
      headless: true,

      protocolTimeout: 180000,

      args: ambiente === "VPS"
        ? argsVPS
        : argsDesktop

    }

  });

}

// =======================
// INICIALIZA CLIENT
// =======================
let client = criarClient();

registrarEventos(client);

client.initialize()
.then(() => {

  console.log("🚀 Inicialização solicitada.");

})
.catch(err => {

  console.error("❌ Erro ao inicializar:");
  console.error(err);

});

// =======================
// REGISTRA EVENTOS
// =======================
function registrarEventos(c) {

  // QR CODE
  c.on('qr', qr => {

    console.log('📲 Novo QR Code gerado');

    qrCodeString = qr;
    whatsappConectado = false;
    clientPronto = false;
    tentativasReconect = 0;

  });

  // AUTHENTICATED
  c.on('authenticated', () => {

    console.log('🔐 Sessão autenticada');

    tentativasReconect = 0;

  });

  // READY
  c.on('ready', () => {

    console.log('✅ WhatsApp conectado');

    whatsappConectado = true;
    clientPronto = true;
    qrCodeString = null;
    tentativasReconect = 0;

  });

  // LOADING
  c.on('loading_screen', (percent, message) => {

    console.log(`⏳ ${percent}% - ${message}`);

  });

  // AUTH FAILURE
  c.on('auth_failure', async msg => {

    console.error("❌ AUTH FAILURE");
    console.error(msg);

    whatsappConectado = false;
    clientPronto = false;

    await reconectar(true);

  });

  // DESCONECTOU
  c.on('disconnected', async reason => {

    console.warn("⚠️ WhatsApp desconectado");
    console.warn("Motivo:", reason);

    whatsappConectado = false;
    clientPronto = false;

    const limpar = reason === 'LOGOUT';

    await reconectar(limpar);

  });

  // MENSAGENS
  c.on('message', async msg => {

    await processarMensagem(msg);

  });

}

// =======================
// RECONEXÃO
// =======================
async function reconectar(limpar = false) {

  if (tentativasReconect >= MAX_TENTATIVAS) {

    console.error(`🚫 Máximo de ${MAX_TENTATIVAS} tentativas.`);

    return;

  }

  tentativasReconect++;

  const espera = tentativasReconect * 5000;

  console.log(`🔄 Reconectando em ${espera / 1000}s...`);

  await sleep(espera);

  try {

    await client.destroy();

  } catch (_) {}

  if (limpar) {

    limparSessao();

  }

  client = criarClient();

  registrarEventos(client);

  try {

    await client.initialize();

  } catch (err) {

    console.error("❌ Erro ao reinicializar");
    console.error(err);

  }

}

// =======================
// SLEEP
// =======================
function sleep(ms) {

  return new Promise(resolve => setTimeout(resolve, ms));

}

// =======================
// AUXILIARES
// =======================
function limparNumero(raw = '') {

  return raw
    .replace(/@.*$/, '')
    .replace(/\D/g, '');

}

function formatarE164(numero = '') {

  return `+${numero}`;

}

async function resolverNumero(msg, contact) {

  if (contact.id?._serialized?.endsWith('@c.us')) {

    return contact.id.user;

  }

  if (msg.from?.endsWith('@c.us')) {

    return msg.from.replace('@c.us', '');

  }

  return limparNumero(contact.number || msg.from || '');

}

function resolverTipo(msg) {

  const tipos = {

    [MessageTypes.TEXT]: 'text',
    [MessageTypes.IMAGE]: 'image',
    [MessageTypes.VIDEO]: 'video',
    [MessageTypes.AUDIO]: 'audio',
    [MessageTypes.VOICE]: 'voice',
    [MessageTypes.DOCUMENT]: 'document',
    [MessageTypes.STICKER]: 'sticker',
    [MessageTypes.LOCATION]: 'location',
    [MessageTypes.CONTACT_CARD]: 'contact',
    [MessageTypes.CONTACT_CARD_MULTI]: 'contact_multi',
    [MessageTypes.LIST]: 'list',
    [MessageTypes.BUTTONS_RESPONSE]: 'button_response',
    [MessageTypes.POLL_CREATION]: 'poll'

  };

  return tipos[msg.type] || msg.type || 'unknown';

}

// =======================
// PROCESSAR MENSAGEM
// =======================
async function processarMensagem(msg) {

  try {

    const contact = await msg.getContact();
    const chat = await msg.getChat();

    const numero = await resolverNumero(msg, contact);

    const payload = {

      messageId: msg.id?.id || null,

      timestamp: msg.timestamp,

      timestampISO: new Date(msg.timestamp * 1000).toISOString(),

      numero,

      numeroE164: formatarE164(numero),

      nome:
        contact.pushname ||
        contact.name ||
        contact.shortName ||
        "Desconhecido",

      tipo: resolverTipo(msg),

      mensagem: msg.body || null,

      isGrupo: chat.isGroup,

      grupoId: chat.isGroup
        ? limparNumero(chat.id._serialized)
        : null,

      grupoNome: chat.isGroup
        ? chat.name
        : null,

      temMidia: msg.hasMedia

    };

    console.log(`📩 ${payload.nome} (${payload.numero})`);

    let enviado = false;

    for (let tentativa = 1; tentativa <= 3; tentativa++) {

      try {

        await axios.post(

          N8N_WEBHOOK,

          payload,

          {
            timeout: 10000
          }

        );

        enviado = true;

        console.log("📡 Enviado ao n8n");

        break;

      } catch (erro) {

        console.warn(`⚠️ Tentativa ${tentativa}/3`);

        console.warn(erro.message);

        await sleep(2000);

      }

    }

    if (!enviado) {

      console.error("❌ Não foi possível enviar ao n8n");

    }

  } catch (erro) {

    console.error("❌ Erro ao processar mensagem");

    console.error(erro);

  }

}

// =======================
// ROTA: QR CODE
// =======================
app.get('/qr', async (req, res) => {

  try {

    if (whatsappConectado) {

      return res.send(
        htmlSimples(
          "✅ WhatsApp Conectado",
          "#25D366"
        )
      );

    }

    if (!qrCodeString) {

      return res.send(
        htmlSimples(
          "⏳ Aguardando QR Code...",
          "#F0A500"
        )
      );

    }

    const qrImage =
      await qrcode.toDataURL(qrCodeString);

    res.send(`

      <html>

      <head>

        <title>WhatsApp QR Code</title>

        <meta http-equiv="refresh" content="20">

      </head>

      <body
        style="
          background:#111;
          color:white;
          display:flex;
          justify-content:center;
          align-items:center;
          height:100vh;
          font-family:sans-serif;
        "
      >

        <div
          style="
            background:white;
            color:black;
            padding:30px;
            border-radius:20px;
            text-align:center;
          "
        >

          <h2>📲 Escaneie o QR Code</h2>

          <img
            src="${qrImage}"
            width="350"
          >

          <p style="color:#777">

            Atualização automática a cada 20 segundos

          </p>

        </div>

      </body>

      </html>

    `);

  }

  catch (erro) {

    console.error(erro);

    res
      .status(500)
      .send(erro.message);

  }

});

// =======================
// HTML SIMPLES
// =======================
function htmlSimples(texto, cor) {

  return `

  <html>

  <body

    style="
      background:#111;
      display:flex;
      justify-content:center;
      align-items:center;
      height:100vh;
      color:${cor};
      font-family:sans-serif;
    "

  >

    <h1>${texto}</h1>

  </body>

  </html>

  `;

}

// =======================
// STATUS
// =======================
app.get('/status', (req, res) => {

  res.json({

    status:

      whatsappConectado
        ? "online"
        : "offline",

    conectado:
      whatsappConectado,

    pronto:
      clientPronto,

    telefone:
      client.info?.wid?._serialized || null,

    tentativas:
      tentativasReconect,

    browser:
      executablePath || "automático",

    ambiente,

    timestamp:
      new Date().toISOString()

  });

});

// =======================
// ENVIAR MENSAGEM
// =======================
app.post('/send', async (req, res) => {

  try {

    const body =
      req.body || {};

    const numero =
      body.numero;

    const mensagem =
      body.mensagem;

    if (!numero || !mensagem) {

      return res.status(400).json({

        error:
          'Campos "numero" e "mensagem" são obrigatórios'

      });

    }

    if (!clientPronto) {

      return res.status(503).json({

        error:
          "WhatsApp ainda não está pronto."

      });

    }

    const numeroLimpo =
      numero
        .toString()
        .replace(/\D/g,'');

    const numberId =
      await client.getNumberId(numeroLimpo);

    if (!numberId) {

      return res.status(404).json({

        error:
          "Número não encontrado."

      });

    }

    const enviada =
      await client.sendMessage(

        numberId._serialized,

        mensagem

      );

    res.json({

      status:
        "enviado",

      para:
        numeroLimpo,

      messageId:
        enviada.id?.id || null,

      timestamp:
        new Date().toISOString()

    });

  }

  catch (erro) {

    console.error(erro);

    res.status(500).json({

      error:
        erro.message

    });

  }

});

// =======================
// REINICIAR CLIENT
// =======================
app.post('/reconectar', async (req, res) => {

  tentativasReconect = 0;

  res.json({

    sucesso: true,

    mensagem:
      "Reconexão iniciada."

  });

  await reconectar(

    req.body?.limpar === true

  );

});

// =======================
// HEALTHCHECK
// =======================
app.get('/', (req,res)=>{

  res.send("WhatsApp API Online");

});

// =======================
// SERVER
// =======================
app.listen(PORT, () => {

  console.log("");

  console.log("=======================================");

  console.log(`🚀 API rodando na porta ${PORT}`);

  console.log(`🌐 Ambiente : ${ambiente}`);

  console.log(`🌎 Browser  : ${executablePath || "Automático"}`);

  console.log("");

  console.log(`QR Code:`);

  console.log(`http://localhost:${PORT}/qr`);

  console.log("");

  console.log(`Status:`);

  console.log(`http://localhost:${PORT}/status`);

  console.log("");

  console.log("=======================================");

});