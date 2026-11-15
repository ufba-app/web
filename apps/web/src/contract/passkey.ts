import { z } from 'zod/mini';

/**
 * Chave mestra (passkey) e correio do QR. Só o contrato: ainda não há tela (o desenho está com o André).
 * Rotas: GET/POST /sigaa/passkey, POST /sigaa/passkey/slot, DELETE /sigaa/passkey/{credentialId} e
 * POST /pairings, GET /pairings/{id}/info, POST /pairings/{id}, GET /pairings/{id}. Os campos binários vêm em
 * base64url. Nada disso é senha em claro: `iv`/`ciphertext` são o que o navegador cifrou antes de enviar.
 */

export const passkeyListSchema = z.object({
  passkeys: z.array(
    z.object({
      credentialId: z.string(),
      prfSalt: z.string(),
      label: z.nullable(z.string()),
      createdAt: z.string(),
      lastUnlockedAt: z.nullable(z.string()),
    }),
  ),
});
export type PasskeyList = z.infer<typeof passkeyListSchema>;

/** POST /sigaa/passkey/slot: o que o navegador precisa para destravar com a passkey. */
export const passkeySlotSchema = z.object({
  prfSalt: z.string(),
  iv: z.string(),
  ciphertext: z.string(),
});
export type PasskeySlot = z.infer<typeof passkeySlotSchema>;

/** POST /pairings (201). */
export const pairingCreatedSchema = z.object({
  id: z.string(),
  expiresAt: z.string(),
});
export type PairingCreated = z.infer<typeof pairingCreatedSchema>;

/** GET /pairings/{id}/info: quem entrega vê o que está pareando antes de enviar. */
export const pairingInfoSchema = z.object({
  label: z.nullable(z.string()),
  client: z.nullable(z.string()),
  createdAt: z.string(),
  expiresAt: z.string(),
  delivered: z.boolean(),
});
export type PairingInfo = z.infer<typeof pairingInfoSchema>;

/** GET /pairings/{id}: `pending` até alguém entregar; `delivered` traz `pub`, `iv` e `ciphertext`. */
export const pairingReadSchema = z.object({
  status: z.enum(['pending', 'delivered']),
  pub: z.optional(z.string()),
  iv: z.optional(z.string()),
  ciphertext: z.optional(z.string()),
});
export type PairingRead = z.infer<typeof pairingReadSchema>;
