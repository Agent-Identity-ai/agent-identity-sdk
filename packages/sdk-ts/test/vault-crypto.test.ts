import { describe, expect, it } from "vitest";
import { generateVaultKeypair, vaultDecrypt, vaultEncrypt } from "../src/vault-crypto.js";

describe("vault-crypto (X25519 ECIES)", () => {
  it("round-trips plaintext through encrypt -> decrypt using only the recipient's own keypair", () => {
    const recipient = generateVaultKeypair();
    const envelope = vaultEncrypt(Buffer.from("ghp_super_secret_value", "utf8"), recipient.publicKey);

    const plaintext = vaultDecrypt(envelope, recipient.publicKey, recipient.privateKey);
    expect(plaintext.toString("utf8")).toBe("ghp_super_secret_value");
  });

  it("produces a different ephemeral key and ciphertext on every call (no key/nonce reuse)", () => {
    const recipient = generateVaultKeypair();
    const a = vaultEncrypt(Buffer.from("same-value"), recipient.publicKey);
    const b = vaultEncrypt(Buffer.from("same-value"), recipient.publicKey);
    expect(a.ephemeralPublicKey).not.toBe(b.ephemeralPublicKey);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("cannot be decrypted with a different identity's private key", () => {
    const recipient = generateVaultKeypair();
    const attacker = generateVaultKeypair();
    const envelope = vaultEncrypt(Buffer.from("top-secret"), recipient.publicKey);

    expect(() => vaultDecrypt(envelope, attacker.publicKey, attacker.privateKey)).toThrow();
  });

  it("fails closed on a tampered ciphertext (AES-GCM auth tag catches it)", () => {
    const recipient = generateVaultKeypair();
    const envelope = vaultEncrypt(Buffer.from("integrity-matters"), recipient.publicKey);
    const [iv, tag, data] = envelope.ciphertext.split(".");
    const tamperedData = Buffer.from(data!, "base64");
    tamperedData[0] = tamperedData[0]! ^ 0xff;
    const tampered = { ...envelope, ciphertext: `${iv}.${tag}.${tamperedData.toString("base64")}` };

    expect(() => vaultDecrypt(tampered, recipient.publicKey, recipient.privateKey)).toThrow();
  });
});
