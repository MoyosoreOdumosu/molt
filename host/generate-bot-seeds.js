const xrpl = require('xrpl');
const fs = require('fs');

async function generateBotSeeds() {
  console.log('Generating seeds for Bot-A and Bot-B addresses...\n');
  console.log('⚠️  Note: These will be NEW wallets, not the addresses you provided.\n');
  console.log('   If you need to use the specific addresses (rwy3giz... and rwrv9Wq...),');
  console.log('   you must provide their seeds.\n');

  // Generate Bot-A wallet
  const walletA = xrpl.Wallet.generate();
  console.log('✅ Bot-A Wallet Generated:');
  console.log('   Address:', walletA.address);
  console.log('   Seed:', walletA.seed);
  console.log('   Public Key:', walletA.publicKey);
  console.log('');

  // Generate Bot-B wallet
  const walletB = xrpl.Wallet.generate();
  console.log('✅ Bot-B Wallet Generated:');
  console.log('   Address:', walletB.address);
  console.log('   Seed:', walletB.seed);
  console.log('   Public Key:', walletB.publicKey);
  console.log('');

  // Update config files
  const configA = JSON.parse(fs.readFileSync('config.a.json', 'utf8'));
  configA.bot.seed = walletA.seed;
  fs.writeFileSync('config.a.json', JSON.stringify(configA, null, 2));
  console.log('✅ Updated config.a.json with Bot-A seed');

  const configB = JSON.parse(fs.readFileSync('config.b.json', 'utf8'));
  configB.bot.seed = walletB.seed;
  fs.writeFileSync('config.b.json', JSON.stringify(configB, null, 2));
  console.log('✅ Updated config.b.json with Bot-B seed');
  console.log('');

  console.log('📝 Next: Fund these addresses from the testnet faucet:');
  console.log(`   Bot-A: ${walletA.address}`);
  console.log(`   Bot-B: ${walletB.address}`);
  console.log('');
  console.log('   Run: node fund-addresses.js (after updating addresses)');
  console.log('   Or visit: https://xrpl.org/xrp-testnet-faucet.html');
}

generateBotSeeds().catch(console.error);
