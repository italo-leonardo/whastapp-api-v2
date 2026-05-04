const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(express.json());

const client = new Client({
  authStrategy: new LocalAuth()
});

client.on('qr', qr => {
  console.log('Escaneie o QR Code abaixo:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('WhatsApp conectado!');
});

client.initialize();

app.post('/send', async (req, res) => {
  const { numero, mensagem } = req.body;

  try {
    const numberId = await client.getNumberId(numero);

    if (!numberId) {
      return res.status(400).json({ error: 'Número não existe no WhatsApp' });
    }

    await client.sendMessage(numberId._serialized, mensagem);

    res.json({ status: 'enviado' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log('API rodando na porta 3000');
});