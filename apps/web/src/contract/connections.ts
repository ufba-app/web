import { z } from 'zod/mini';

export const moodleStartSchema = z.object({
  launchUrl: z.string(),
  scheme: z.string(),
});
export type MoodleStart = z.infer<typeof moodleStartSchema>;
