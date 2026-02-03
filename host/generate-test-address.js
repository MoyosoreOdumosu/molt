const xrpl = require('xrpl');

async function generateTestAddress() {
  console.log('Generating test XRP address...\n');
  
  // Generate a new wallet
  const wallet = xrpl.Wallet.generate();
  
  console.log('✅ Wallet Generated:');
  console.log('   Address:', wallet.address);
  console.log('   Seed:', wallet.seed);
  console.log('   Public Key:', wallet.publicKey);
  console.log('\n📝 Funding wallet from testnet faucet...\n');
  
  // Fund the wallet using testnet faucet
  try {
    const response = await fetch('https://faucet.altnet.rippletest.net/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination: wallet.address })
    });
    
    const data = await response.json();
    
    if (data.balance) {
      console.log('✅ Wallet Funded Successfully!');
      console.log('   Balance:', data.balance, 'XRP');
      console.log('\n📋 Configuration:');
      console.log('   Add this seed to config.json:');
      console.log('   "seed": "' + wallet.seed + '"');
    } else {
      console.log('⚠️  Faucet response:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('❌ Error funding wallet:', error.message);
    console.log('\n💡 You can manually fund at: https://xrpl.org/xrp-testnet-faucet.html');
  }
  
  return wallet;
}

generateTestAddress().catch(console.error);
