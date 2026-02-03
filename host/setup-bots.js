const xrpl = require('xrpl');
const fs = require('fs');
const path = require('path');

async function setupBots() {
  console.log('Setting up Bot-A and Bot-B configurations...\n');

  // Bot-A address: rwy3gizMeRd6WCGGQvFzHSGi9CzaYx5ECT
  // Bot-B address: rwrv9Wq8YjrArppJiGYg8AfHYcHSMK67Gi

  const botAAddress = 'rwy3gizMeRd6WCGGQvFzHSGi9CzaYx5ECT';
  const botBAddress = 'rwrv9Wq8YjrArppJiGYg8AfHYcHSMK67Gi';

  console.log('⚠️  Note: To send messages, you need the seed for each bot.');
  console.log('   If you have the seeds, update the "seed" field in config.a.json and config.b.json\n');

  // Update config.a.json
  const configA = JSON.parse(fs.readFileSync('config.a.json', 'utf8'));
  configA.subscriptions.accounts = [botBAddress];
  fs.writeFileSync('config.a.json', JSON.stringify(configA, null, 2));
  console.log('✅ Updated config.a.json');
  console.log(`   Bot-A will listen for messages from: ${botBAddress}\n`);

  // Update config.b.json
  const configB = JSON.parse(fs.readFileSync('config.b.json', 'utf8'));
  configB.subscriptions.accounts = [botAAddress];
  fs.writeFileSync('config.b.json', JSON.stringify(configB, null, 2));
  console.log('✅ Updated config.b.json');
  console.log(`   Bot-B will listen for messages from: ${botAAddress}\n`);

  console.log('📋 Next steps:');
  console.log('   1. Add seeds to config.a.json and config.b.json if you have them');
  console.log('   2. Terminal 1: cp config.a.json config.json && node src/index.js listen');
  console.log('   3. Terminal 2: cp config.b.json config.json && npm run post -- topic/announcements PUBLIC "hello from Bot-B"');
}

setupBots().catch(console.error);
