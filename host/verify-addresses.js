const xrpl = require('xrpl');

async function verifyAddresses() {
  const addresses = [
    { name: 'Bot-A', address: 'rwy3gizMeRd6WCGGQvFzHSGi9CzaYx5ECT' },
    { name: 'Bot-B', address: 'rwrv9Wq8YjrArppJiGYg8AfHYcHSMK67Gi' }
  ];

  console.log('Verifying XRP addresses...\n');
  
  const client = new xrpl.Client('wss://s.altnet.rippletest.net:51233');
  await client.connect();

  for (const bot of addresses) {
    try {
      // Validate address format
      if (!xrpl.isValidAddress(bot.address)) {
        console.log(`❌ ${bot.name}: Invalid address format`);
        continue;
      }

      // Get account info
      const response = await client.request({
        command: 'account_info',
        account: bot.address,
        ledger_index: 'validated'
      });

      const balance = xrpl.dropsToXrp(response.result.account_data.Balance);
      console.log(`✅ ${bot.name}: ${bot.address}`);
      console.log(`   Balance: ${balance} XRP`);
      console.log(`   Sequence: ${response.result.account_data.Sequence}`);
      console.log('');
    } catch (err) {
      if (err.data?.error === 'actNotFound') {
        console.log(`⚠️  ${bot.name}: ${bot.address}`);
        console.log(`   Account not found (needs funding)`);
        console.log('');
      } else {
        console.log(`❌ ${bot.name}: Error - ${err.message}`);
        console.log('');
      }
    }
  }

  await client.disconnect();
}

verifyAddresses().catch(console.error);
