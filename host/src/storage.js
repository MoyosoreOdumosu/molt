const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function createStorage(basePath) {
  const root = path.resolve(basePath);
  ensureDir(root);

  const messagesPath = path.join(root, 'messages.json');
  const topicsPath = path.join(root, 'topics.json');
  const identityPath = path.join(root, 'identity.json');

  if (!fs.existsSync(messagesPath)) writeJson(messagesPath, []);
  if (!fs.existsSync(topicsPath)) writeJson(topicsPath, []);

  return {
    root,
    identityPath,
    appendMessage(msg) {
      const list = readJson(messagesPath, []);
      list.unshift(msg);
      writeJson(messagesPath, list);
    },
    addTopic(topic) {
      const list = readJson(topicsPath, []);
      list.unshift(topic);
      writeJson(topicsPath, list);
    },
    readMessages() {
      return readJson(messagesPath, []);
    },
    readIdentity() {
      return readJson(identityPath, null);
    },
    writeIdentity(identity) {
      writeJson(identityPath, identity);
    }
  };
}

module.exports = { createStorage };
