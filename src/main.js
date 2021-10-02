const fs = require("fs");
const axios = require("axios");
const express = require("express");
const Insta = require("scraper-instagram");
require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

const InstaClient = new Insta();

const config = {
  wppSecret: process.env.WPP_SECRET, // secret of wppconnect-server
  baseUrl: "http://localhost:21465", // baseurl of wppconnect-server
  session: "sessao1",
  token: null,
  phones: process.env.PHONES.split(","), // groups to send message
  isGroup: true,
  sessionID: process.env.INSTA_SESSIONID, // instagram session id, find it at cookies
  minToProcess: 10, // minutes to process data
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
};

InstaClient.authBySessionId(config.sessionID).then((account) => {
  console.log(`Authenticated at instagram with user: ${account.first_name}`);
});

const client = axios.create({
  baseURL: `${config.baseUrl}/api`,
});

function getBase64(url) {
  return axios
    .get(url, {
      responseType: "arraybuffer",
    })
    .then(
      (response) =>
        `data:image/png;base64,${Buffer.from(response.data, "binary").toString(
          "base64"
        )}`
    );
}

function getAuthAxiosConfig() {
  return {
    headers: {
      Authorization: `Bearer ${config.token}`,
    },
  };
}

function sendTelegramMessage(message) {
  if (config.telegramBotToken && config.telegramChatId) {
    const bot = new TelegramBot(config.telegramBotToken, { polling: true });
    bot.sendMessage(config.telegramChatId, message);
  } else {
    console.log(message);
  }
}

async function sendImage(imageUrl, phone) {
  await client.post(
    `/${config.session}/send-file-base64`,
    {
      phone,
      base64: await getBase64(imageUrl),
      isGroup: config.isGroup,
    },
    getAuthAxiosConfig()
  );
}

async function sendMessage(message, phone) {
  await client.post(
    `/${config.session}/send-message`,
    {
      phone,
      message,
      isGroup: config.isGroup,
    },
    getAuthAxiosConfig()
  );
}

async function getPostImages(postId) {
  const images = await InstaClient.getPost(postId)
    .then((post) => post.contents)
    .catch((err) => console.error(err));
  return images;
}

async function processData(report) {
  for (const phone of config.phones) {
    const images = await getPostImages(report.shortcode);
    if (images.length > 1) {
      await sendMessage(report.caption, phone);
      for (const image of images) {
        await sendImage(image.url, phone);
      }
    } else {
      await sendImage(images[0].url, phone);
      await sendMessage(report.caption, phone);
    }
  }
}

async function validateExistId(id) {
  try {
    const rawdata = await fs.readFileSync(__dirname + `/processed-data.json`);
    const data = JSON.parse(rawdata);
    return data.includes(id);
  } catch {
    return false;
  }
}

async function writeData(id) {
  try {
    const rawdata = await fs.readFileSync(__dirname + `/processed-data.json`);
    const existsData = JSON.parse(rawdata);
    const newData = [...existsData, id];

    const data = JSON.stringify(newData);
    fs.writeFileSync(__dirname + `/processed-data.json`, data);
  } catch {
    fs.writeFileSync(__dirname + `/processed-data.json`, JSON.stringify([id]));
  }
}

async function findData() {
  console.log("RUNNING TIME - ", new Date());
  InstaClient.getProfile("shorelinesurfskate")
    .then(async ({ lastPosts }) => {
      const data = lastPosts.filter(
        (p) =>
          p.caption.includes("PLANTÃO DAS ONDAS SHORELINE") ||
          p.caption.includes("PREVISÃO DAS ONDAS SHORELINE")
      );
      const report = data[0];
      const exist = await validateExistId(report.shortcode);
      if (!exist) {
        await processData(report);
        await writeData(report.shortcode);
        sendTelegramMessage(`END PROCESS WITH SUCCESS - ${new Date()}`);
      }
      console.log("END PROCESS WITH SUCCESS - ", new Date());
    })
    .catch(console.error);
}

async function startAllSessionsAndCheckSession() {
  await client.post(`/${config.wppSecret}/start-all`);
  await client
    .post(`/${config.session}/${config.wppSecret}/generate-token`)
    .then(({ data: { token } }) => {
      config.token = token;
    });
  const status = await client
    .get(`/${config.session}/check-connection-session`, getAuthAxiosConfig())
    .then(({ data: { status } }) => status);
  return status;
}

const app = express();
app.use(express.json());

async function runProcess() {
  try {
    const validSession = await startAllSessionsAndCheckSession();
    if (validSession) {
      await findData();
    }
  } catch ({ response }) {
    const { path, data, status, statusText } = response;
    sendTelegramMessage(
      `❌ OCORREU UM ERRO ❌
      ${JSON.stringify({
        path,
        data,
        status,
        statusText,
      })}`
    );
  }
}

setTimeout(async () => {
  runProcess();
}, 2000);

setInterval(async () => {
  runProcess();
}, [config.minToProcess * 60000]);

app.listen(3001, () => console.log("🔥 Server started at localhost:3001"));
