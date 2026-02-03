const xrpl = require('xrpl');

async function fundAddresses() {
  const addresses = [
    { name: 'Bot-A', address: 'rwy3gizMeRd6WCGGQvFzHSGi9CzaYx5ECT' },
    { name: 'Bot-B', address: 'rwrv9Wq8YjrArppJiGYg8AfHYcHSMK67Gi' }
  ];

  console.log('Funding XRP testnet addresses...\n');
  
  for (const bot of addresses) {
    try {
      console.log(`📝 Requesting funds for ${bot.name} (${bot.address})...`);
      const response = await fetch('https://faucet.altnet.rippletest.net/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: bot.address })
      });
      
      const data = await response.json();
      
      if (data.balance || data.amount) {
        console.log(`✅ ${bot.name} funded successfully!`);
        console.log(`   Balance: ${data.balance || data.amount} XRP`);
        if (data.transactionHash) {
          console.log(`   Transaction: ${data.transactionHash}`);
        }
        console.log('');
      } else {
        console.log(`⚠️  ${bot.name}: Unexpected response:`, JSON.stringify(data, null, 2));
        console.log('');
      }
    } catch (error) {
      console.error(`❌ ${bot.name}: Error - ${error.message}`);
      console.log('');
    }
  }
  
  console.log('💡 You can also manually fund at: https://xrpl.org/xrp-testnet-faucet.html');
}

fundAddresses().catch(console.error);
