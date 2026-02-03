let ipfsClientModule = null;

async function loadIpfsClient() {
  if (ipfsClientModule) return ipfsClientModule;
  try {
    ipfsClientModule = await import('ipfs-http-client');
    return ipfsClientModule;
  } catch (err) {
    throw new Error('Failed to load ipfs-http-client: ' + err.message);
  }
}

async function createIpfsClient(config) {
  if (!config?.enabled) return null;
  const url = config.apiUrl || 'http://127.0.0.1:5001';
  const { create } = await loadIpfsClient();
  return create({ url });
}

async function storePayload(ipfs, payload) {
  if (!ipfs) return null;
  const { cid } = await ipfs.add(payload);
  return cid.toString();
}

async function fetchPayload(ipfs, cid) {
  if (!ipfs) return null;
  const chunks = [];
  for await (const chunk of ipfs.cat(cid)) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

module.exports = { createIpfsClient, storePayload, fetchPayload };
