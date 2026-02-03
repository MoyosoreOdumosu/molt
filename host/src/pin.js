const { create } = require('ipfs-http-client');

async function pinCid(config, cid) {
  if (!config.ipfs?.enabled || !config.ipfs?.apiUrl) {
    throw new Error('IPFS is disabled or config.ipfs.apiUrl missing');
  }
  if (!cid) {
    throw new Error('CID required');
  }
  const ipfs = create({ url: config.ipfs.apiUrl });
  await ipfs.pin.add(cid);
  return cid;
}

module.exports = { pinCid };
