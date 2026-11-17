// Decodes and inspects a base64-encoded PEM certificate (e.g. the value of
// SUPABASE_CA_CERT_BASE64) using only Node's crypto module.
import crypto from 'node:crypto';

const raw = process.argv[2];
if (!raw) {
  console.log('usage: node scripts/inspect-cert.mjs <base64>');
  process.exit(1);
}

const pem = Buffer.from(raw.trim(), 'base64').toString('utf8').trim();
console.log('--- decoded PEM ---');
console.log(pem.split('\n').slice(0, 2).join('\n') + '\n...\n' + pem.split('\n').slice(-2).join('\n'));
console.log(`\nbytes: ${Buffer.byteLength(pem)}  lines: ${pem.split('\n').length}`);
console.log(`contains BEGIN CERTIFICATE: ${pem.includes('-----BEGIN CERTIFICATE-----')}`);
console.log(`contains END CERTIFICATE:   ${pem.includes('-----END CERTIFICATE-----')}`);

if (!pem.includes('-----BEGIN CERTIFICATE-----')) {
  console.log('\nNOT a PEM certificate.');
  process.exit(0);
}

const x509 = new crypto.X509Certificate(pem);
console.log('\n--- fields ---');
console.log('subject:            ', x509.subject);
console.log('issuer:             ', x509.issuer);
console.log('serialNumber:       ', x509.serialNumber);
console.log('validFrom:          ', x509.validFrom);
console.log('validTo:            ', x509.validTo);
console.log('basicConstraintsCA: ', x509.ca);
console.log('fingerprint256:     ', x509.fingerprint256);
console.log('keyUsage:           ', x509.keyUsage);
console.log('subjectAltName:     ', x509.subjectAltName);
