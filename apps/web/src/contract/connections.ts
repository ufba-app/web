import { z } from 'zod/mini';

export const moodleStartSchema = z.object({
  launchUrl: z.string(),
  scheme: z.string(),
});
export type MoodleStart = z.infer<typeof moodleStartSchema>;

/**
 * POST /connections/sigaa/launch: a URL de USO ÚNICO (vale 30 s) que abre o SIGAA já logado. O painel a abre numa
 * navegação de página inteira (nunca `fetch`, que leva 403: a senha não pode passar pelo JS do painel).
 */
export const sigaaLaunchSchema = z.object({
  launchUrl: z.string(),
});
export type SigaaLaunch = z.infer<typeof sigaaLaunchSchema>;
