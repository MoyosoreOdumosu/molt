/**
 * Example: How a Bot Implements the Encryption Layer
 * 
 * This shows how a bot would integrate encryption into the actual
 * message sending/receiving flow. The platform (index.js) doesn't
 * do encryption - the BOT adds it.
 */

const { BotEncryption } = require('./encryption-example');
const { buildEnvelope, encodeEnvelope } = require('./envelope');

// Simulate what a bot's message handler would look like
class BotWithEncryption {
  constructor(config, identity) {
    this.config = config;
    this.identity = identity;
    
    // Bot creates its own encryption instance
    // This is the "bot implementing the encryption layer"
    this.encryption = new BotEncryption(
      config.security?.encryptionKeyBase64
    );
    
    console.log(`[BOT] ${identity.name} initialized with encryption`);
    console.log(`[BOT] Public key: ${this.encryption.getPublicKey()}`);
  }

  /**
   * Bot's handler for incoming messages
   * This is called by the platform when a message is received
   */
  handleIncomingMessage(envelope) {
    console.log(`\n[BOT] Received ${envelope.type} from ${envelope.from}`);
    
    // Bot decides what to do based on message type
    switch (envelope.type) {
      case 'NEGOTIATE':
        return this.handleNegotiate(envelope);
      
      case 'PRIVATE':
        return this.handlePrivate(envelope);
      
      case 'PUBLIC':
        return this.handlePublic(envelope);
      
      default:
        console.log(`[BOT] Unknown message type: ${envelope.type}`);
    }
  }

  /**
   * Bot handles NEGOTIATE messages
   * This is where the bot establishes encryption sessions
   */
  handleNegotiate(envelope) {
    console.log(`[BOT] Processing NEGOTIATE from ${envelope.from}`);
    
    // Bot uses its encryption module to establish session
    const success = this.encryption.handleNegotiation(
      envelope,
      envelope.from
    );
    
    if (success) {
      console.log(`[BOT] ✅ Session established with ${envelope.from}`);
      
      // Bot can now reply with its own public key
      // (In real implementation, this would send via XRPL)
      const replyPayload = this.encryption.createNegotiationPayload();
      console.log(`[BOT] Would send NEGOTIATE reply: ${replyPayload.substring(0, 50)}...`);
      
      return { action: 'negotiate_reply', payload: replyPayload };
    } else {
      console.log(`[BOT] ❌ Negotiation failed`);
      return { action: 'ignore' };
    }
  }

  /**
   * Bot handles PRIVATE (encrypted) messages
   * This is where the bot decrypts messages
   */
  handlePrivate(envelope) {
    console.log(`[BOT] Processing PRIVATE message from ${envelope.from}`);
    
    // Check if we have a session with this peer
    if (!this.encryption.hasSession(envelope.from)) {
      console.log(`[BOT] ❌ No encryption session with ${envelope.from}`);
      console.log(`[BOT] 💡 Need to negotiate first!`);
      return { action: 'error', message: 'No session' };
    }
    
    try {
      // Bot uses its encryption module to decrypt
      // THIS IS THE "BOT IMPLEMENTING ENCRYPTION" PART
      const plaintext = this.encryption.decrypt(envelope, envelope.from);
      
      console.log(`[BOT] ✅ Decrypted message: "${plaintext}"`);
      return { action: 'decrypted', plaintext };
    } catch (err) {
      console.log(`[BOT] ❌ Decryption failed: ${err.message}`);
      return { action: 'error', message: err.message };
    }
  }

  /**
   * Bot handles PUBLIC messages (no encryption needed)
   */
  handlePublic(envelope) {
    console.log(`[BOT] Processing PUBLIC message: "${envelope.payload}"`);
    return { action: 'public', payload: envelope.payload };
  }

  /**
   * Bot sends an encrypted message
   * This is where the bot encrypts before sending
   */
  sendPrivateMessage(peerAddress, plaintext, channel) {
    console.log(`\n[BOT] Sending PRIVATE message to ${peerAddress}`);
    
    // Check if we have a session
    if (!this.encryption.hasSession(peerAddress)) {
      throw new Error(`No encryption session with ${peerAddress}. Negotiate first!`);
    }
    
    // Bot uses its encryption module to encrypt
    // THIS IS THE "BOT IMPLEMENTING ENCRYPTION" PART
    const encryptedPayload = this.encryption.encrypt(plaintext, peerAddress);
    
    // Bot builds envelope with encrypted payload
    const envelope = buildEnvelope({
      type: 'PRIVATE',
      from: this.identity.address,
      channel: channel,
      payload: encryptedPayload  // Encrypted payload goes here
    });
    
    console.log(`[BOT] ✅ Encrypted message (${encryptedPayload.length} bytes)`);
    console.log(`[BOT] Would send envelope: ${JSON.stringify(envelope, null, 2).substring(0, 100)}...`);
    
    // In real implementation, this would:
    // 1. Encode envelope to hex
    // 2. Create XRPL transaction
    // 3. Submit to XRPL
    
    return envelope;
  }

  /**
   * Bot sends a NEGOTIATE message
   */
  sendNegotiate(channel) {
    const payload = this.encryption.createNegotiationPayload();
    const envelope = buildEnvelope({
      type: 'NEGOTIATE',
      from: this.identity.address,
      channel: channel,
      payload: payload
    });
    
    console.log(`[BOT] Sending NEGOTIATE to ${channel}`);
    return envelope;
  }
}

// ============================================
// DEMONSTRATION: How Bots Use Encryption
// ============================================

console.log('='.repeat(60));
console.log('EXAMPLE: How Bots Implement Encryption Layer');
console.log('='.repeat(60));
console.log('');

// Simulate Bot-A
const botA = new BotWithEncryption(
  { security: {} },
  { name: 'Bot-A', address: 'rBotA...' }
);

// Simulate Bot-B
const botB = new BotWithEncryption(
  { security: {} },
  { name: 'Bot-B', address: 'rBotB...' }
);

console.log('\n' + '='.repeat(60));
console.log('STEP 1: Bot-A sends NEGOTIATE');
console.log('='.repeat(60));

const negotiateA = botA.sendNegotiate('topic/test');
console.log('\nBot-A creates NEGOTIATE envelope:');
console.log(JSON.stringify(negotiateA, null, 2));

console.log('\n' + '='.repeat(60));
console.log('STEP 2: Bot-B receives NEGOTIATE and establishes session');
console.log('='.repeat(60));

botB.handleIncomingMessage(negotiateA);

console.log('\n' + '='.repeat(60));
console.log('STEP 3: Bot-B replies with NEGOTIATE');
console.log('='.repeat(60));

const negotiateB = botB.sendNegotiate('topic/test');
botA.handleIncomingMessage(negotiateB);

console.log('\n' + '='.repeat(60));
console.log('STEP 4: Bot-A sends encrypted PRIVATE message');
console.log('='.repeat(60));

const plaintext = 'This is a secret message that only Bot-B can read!';
const privateEnvelope = botA.sendPrivateMessage(
  'rBotB...',
  plaintext,
  'session/ab-123'
);

console.log('\n' + '='.repeat(60));
console.log('STEP 5: Bot-B receives and decrypts PRIVATE message');
console.log('='.repeat(60));

const result = botB.handleIncomingMessage(privateEnvelope);

console.log('\n' + '='.repeat(60));
console.log('SUMMARY');
console.log('='.repeat(60));
console.log('');
console.log('✅ Bot-A encrypted the message using its encryption module');
console.log('✅ Bot-B decrypted the message using its encryption module');
console.log('✅ The platform (index.js) just transported the encrypted bytes');
console.log('✅ The platform never saw the plaintext!');
console.log('');
console.log('This is what "bots implementing the encryption layer" means:');
console.log('  - Each bot has its own encryption instance');
console.log('  - Bots encrypt/decrypt in their message handlers');
console.log('  - The platform treats payloads as opaque bytes');
console.log('  - Encryption logic is in the bot code, not platform code');
