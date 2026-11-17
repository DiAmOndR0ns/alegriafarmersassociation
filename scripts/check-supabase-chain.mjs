// Diagnostic: does Supabase's published root CA verify the pooler's chain?
// Usage:
//   $env:SUPABASE_DB_HOST="aws-0-<region>.pooler.supabase.com"; node scripts/check-supabase-chain.mjs
// The host must be the bare pooler host WITHOUT the "postgres.<project-ref>" user,
// and is taken from DATABASE_URL when SUPABASE_DB_HOST is unset.
import tls from 'node:tls';
import fs from 'node:fs';

const SUPABASE_CA = process.env.SUPABASE_CA_PEM
  ? fs.readFileSync(process.env.SUPABASE_CA_PEM, 'utf8')
  : `-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFls/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmmnOFKU/d3MqBgBm5y+6
jB81TU/RGy3levPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKtqaCLv12BnVjbkSeZsMnXevJPs1Ye6TjjJwdik5
Po/bKiIz+Fq8=
-----END CERTIFICATE-----`;

const host = process.env.SUPABASE_DB_HOST
  || (() => { try { return new URL(process.env.DATABASE_URL || '').hostname; } catch { return ''; } })();
const port = Number(process.env.SUPABASE_DB_PORT || 6543);

if (!host) {
  console.log('SKIP: set SUPABASE_DB_HOST (e.g. aws-0-ap-southeast-1.pooler.supabase.com).');
  process.exit(0);
}

console.log(`Target: ${host}:${port}\n`);

await new Promise((resolve) => {
  const socket = tls.connect(
    { host, port, servername: host, rejectUnauthorized: false, ALPNProtocols: ['postgresql'] },
    () => {
      const peer = socket.getPeerCertificate(true);
      const chain = [];
      let node = peer;
      const seen = new Set();
      while (node && node.subject && !seen.has(node.fingerprint256)) {
        seen.add(node.fingerprint256);
        chain.push({ subject: node.subject.CN, issuer: node.issuer.CN });
        node = node.issuerCertificate && node.issuerCertificate.fingerprint256 !== node.fingerprint256
          ? node.issuerCertificate : null;
      }
      console.log('Presented chain (leaf -> root):');
      chain.forEach((entry, index) => console.log(`  ${index}: subject=${entry.subject}  issuer=${entry.issuer}`));
      console.log(`Probe authorized=${socket.authorized} reason=${socket.authorizationError || 'none'}`);

      // Re-run the handshake with the bundled CA as the only trust anchor.
      const strict = tls.connect(
        { host, port, servername: host, ca: SUPABASE_CA, rejectUnauthorized: true },
        () => {
          console.log(`\nWith SUPABASE_CA_CERT_BASE64 & rejectUnauthorized:true -> TLS OK (authorized=${strict.authorized})`);
          strict.end();
          socket.end();
          resolve();
        }
      );
      strict.on('error', (error) => {
        console.log(`\nWith SUPABASE_CA_CERT_BASE64 & rejectUnauthorized:true -> ${error.code || 'ERR'}: ${error.message}`);
        strict.destroy();
        socket.end();
        resolve();
      });
    }
  );
  socket.on('error', (error) => {
    console.log(`TLS handshake failed: ${error.code || 'ERR'} - ${error.message}`);
    resolve();
  });
});
