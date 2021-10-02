const fs = require("fs");
const axios = require("axios");
const express = require("express");
const Insta = require("scraper-instagram");
require("dotenv").config();

const InstaClient = new Insta();

const config = {
  // porta do https://github.com/wppconnect-team/wppconnect-server
  baseUrl: "http://localhost:21465",
  session: "sessao1",
  // token do wppconnect-server
  token: process.env.WPP_TOKEN,
  // grupos que sera enviada as msg
  phones: process.env.PHONES.split(","),
  isGroup: true,
  // session do insta, pegado dentro dos cookies
  sessionID: process.env.INSTA_SESSIONID,
};

InstaClient.authBySessionId(config.sessionID).then((account) =>
  console.log("account")
);

const client = axios.create({
  baseURL: `${config.baseUrl}/api`,
  headers: {
    Authorization: `Bearer ${config.token}`,
  },
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

async function sendImage(imageUrl, phone) {
  await client.post(`/${config.session}/send-file-base64`, {
    phone,
    base64: await getBase64(imageUrl),
    isGroup: config.isGroup,
  });
}

async function sendMessage(message, phone) {
  await client.post(`/${config.session}/send-message`, {
    phone,
    message,
    isGroup: config.isGroup,
  });
}

async function getPostImages(postId) {
  const images = await InstaClient.getPost(postId)
    .then((post) => post.contents.filter((c) => c.type === "photo"))
    .catch((err) => console.error(err));
  return images;
}

async function processData(report) {
  for (const phone of config.phones) {
    const images = await getPostImages(report.shortcode);
    if (images > 0) {
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
  const rawdata = await fs.readFileSync("processed-data.json");
  const data = JSON.parse(rawdata);
  return data.includes(id);
}

async function writeData(id) {
  const rawdata = await fs.readFileSync("processed-data.json");
  const existsData = JSON.parse(rawdata);
  const newData = [...existsData, id];

  const data = JSON.stringify(newData);
  fs.writeFileSync("processed-data.json", data);
}

async function findData() {
  console.log("hora que esta rodando - ", new Date());
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
      }
    })
    .catch(console.error);
}

const app = express();
app.use(express.json());

setTimeout(() => {
  findData();
}, 2000);

setInterval(() => {
  findData();
}, [600000]);

app.listen(3001, () => console.log("🔥 Server started at localhost:3001"));
