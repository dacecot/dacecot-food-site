#!/usr/bin/env node
/* ============================================================
   Generate a bcrypt hash for the admin password — never store the plaintext.
   Usage:
     node lib/cms/hash-password.js 'the-password-here'
   Then set the printed hash as the ADMIN_PASSWORD_HASH env var in Vercel
   (Production + Preview). The plaintext is never written anywhere.
   ============================================================ */
const bcrypt = require('bcryptjs');

const pw = process.argv[2];
if (!pw || pw.length < 8) {
  console.error('Usage: node lib/cms/hash-password.js <password>   (min 8 characters)');
  process.exit(1);
}
const hash = bcrypt.hashSync(pw, 12);
console.log('\nADMIN_PASSWORD_HASH=' + hash + '\n');
console.log('Set that in Vercel → Settings → Environment Variables (Production + Preview).');
console.log('Do NOT commit it. The plaintext password is not stored anywhere.\n');
