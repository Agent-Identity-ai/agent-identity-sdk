// X25519 + AES-256-GCM envelope encryption for vault secrets. This lives in the SDK rather than
// a separate package because it runs on the *client* side: plaintext never reaches the API, so
// anyone talking to the vault needs these primitives locally. Node built-ins only, no deps.
import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
} from "node:crypto";


const HKDF_INFO = Buffer.from("aid-vault-v2");
const HKDF_SALT = Buffer.alloc(0);

export interface VaultKeypair {
  publicKey: string;
  privateKey: string;
}

export interface VaultCiphertext {
  ciphertext: string;
  ephemeralPublicKey: string;
}

function publicKeyObject(publicKeyB64url: string) {
  return createPublicKey({ key: { kty: "OKP", crv: "X25519", x: publicKeyB64url }, format: "jwk" });
}

function privateKeyObject(publicKeyB64url: string, privateKeyB64url: string) {
  return createPrivateKey({
    key: { kty: "OKP", crv: "X25519", x: publicKeyB64url, d: privateKeyB64url },
    format: "jwk",
  });
}

function deriveAesKey(sharedSecret: Buffer): Buffer {
  return Buffer.from(hkdfSync("sha256", sharedSecret, HKDF_SALT, HKDF_INFO, 32));
}

export function generateVaultKeypair(): VaultKeypair {
  const { publicKey, privateKey } = generateKeyPairSync("x25519");
  const pubJwk = publicKey.export({ format: "jwk" }) as { x: string };
  const privJwk = privateKey.export({ format: "jwk" }) as { d: string };
  return { publicKey: pubJwk.x, privateKey: privJwk.d };
}

export function vaultEncrypt(plaintext: Buffer, recipientPublicKey: string): VaultCiphertext {
  const ephemeral = generateKeyPairSync("x25519");
  const sharedSecret = diffieHellman({
    privateKey: ephemeral.privateKey,
    publicKey: publicKeyObject(recipientPublicKey),
  });
  const aesKey = deriveAesKey(sharedSecret);

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const ephPubJwk = ephemeral.publicKey.export({ format: "jwk" }) as { x: string };
  return {
    ciphertext: [iv, authTag, encrypted].map((buf) => buf.toString("base64")).join("."),
    ephemeralPublicKey: ephPubJwk.x,
  };
}

export function vaultDecrypt(
  envelope: VaultCiphertext,
  recipientPublicKey: string,
  recipientPrivateKey: string,
): Buffer {
  const sharedSecret = diffieHellman({
    privateKey: privateKeyObject(recipientPublicKey, recipientPrivateKey),
    publicKey: publicKeyObject(envelope.ephemeralPublicKey),
  });
  const aesKey = deriveAesKey(sharedSecret);

  const [ivB64, tagB64, dataB64] = envelope.ciphertext.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("malformed vault envelope");
  }
  const decipher = createDecipheriv("aes-256-gcm", aesKey, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
}
