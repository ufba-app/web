import { z } from 'zod/mini';
import { sourceSchema } from './me';

/**
 * Leitura ao vivo (WEB-API.md, seção 8). Ainda sem tela: Horário, Prazos e Notas são páginas "Em breve".
 * Os schemas ficam aqui para quando essas telas existirem. Textos vêm em texto puro: renderizar como texto, nunca HTML.
 */
export const courseSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.optional(z.string()),
  url: z.optional(z.string()),
});
export type Course = z.infer<typeof courseSchema>;

export const deadlineSchema = z.object({
  id: z.string(),
  title: z.string(),
  dueAt: z.string(),
  courseId: z.optional(z.string()),
  courseName: z.optional(z.string()),
  type: z.optional(z.string()),
  description: z.optional(z.string()),
  url: z.optional(z.string()),
});
export type Deadline = z.infer<typeof deadlineSchema>;

export const attachmentSchema = z.object({
  name: z.string(),
  mimeType: z.optional(z.string()),
  sizeBytes: z.optional(z.number()),
  ref: z.string(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const activitySchema = z.object({
  id: z.string(),
  type: z.enum(['assignment', 'exam', 'material', 'forum', 'announcement', 'other']),
  title: z.string(),
  section: z.optional(z.string()),
  description: z.optional(z.string()),
  dueAt: z.optional(z.string()),
  url: z.optional(z.string()),
  attachments: z.array(attachmentSchema),
  links: z.optional(z.array(z.string())),
  openInBrowser: z.optional(z.array(z.object({ name: z.string(), url: z.string() }))),
  forumId: z.optional(z.string()),
});
export type Activity = z.infer<typeof activitySchema>;

export const discussionSchema = z.object({
  id: z.string(),
  title: z.string(),
  message: z.optional(z.string()),
  author: z.optional(z.string()),
  publishedAt: z.optional(z.string()),
  attachments: z.array(attachmentSchema),
});
export type Discussion = z.infer<typeof discussionSchema>;

export const accountsSchema = z.object({
  accounts: z.array(
    z.object({
      source: sourceSchema,
      account: z.string(),
      status: z.enum(['connected', 'reconnect_required']),
    }),
  ),
});
export const coursesSchema = z.object({ courses: z.array(courseSchema) });
export const deadlinesSchema = z.object({ deadlines: z.array(deadlineSchema) });
export const courseActivitiesSchema = z.object({ courseId: z.string(), activities: z.array(activitySchema) });
export const forumSchema = z.object({ forumId: z.string(), discussions: z.array(discussionSchema) });
export const announcementSchema = z.object({ announcement: discussionSchema });
