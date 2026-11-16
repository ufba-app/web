import { toJSONSchema, type ZodMiniType } from 'zod/mini';
import { describe, expect, it } from 'vitest';
import openapi from './openapi.json';
import {
  academicStateSchema,
  accountsSchema,
  announcementSchema,
  authorizeDecisionSchema,
  authorizeRequestSchema,
  authorizedAppsSchema,
  courseActivitiesSchema,
  deviceLookupSchema,
  coursesSchema,
  curriculumSchema,
  deadlinesSchema,
  myCalendarSchema,
  forumSchema,
  knownErrorCodes,
  adminMemorySyncSchema,
  adminTeamSchema,
  adminTeamSearchSchema,
  memoryComputersSchema,
  memoryProjectDetailSchema,
  memoryProjectSchema,
  memoryProjectsSchema,
  memoryStatusSchema,
  meSchema,
  passkeyListSchema,
  sigaaKeySchema,
  passkeySlotSchema,
  createdPushDeviceSchema,
  notificationSettingsSchema,
  pushConfigSchema,
  pushDevicesSchema,
  pairingInfoSchema,
  pairingReadSchema,
  moodleStartSchema,
  sigaaLaunchSchema,
} from './index';

/**
 * O contrato do web (src/contract) é escrito à mão. Este teste o compara com `openapi.json`, uma cópia do que a API
 * publica em https://api.ufba.app/openapi.json, e falha quando os dois divergem. Para trazer a versão atual da API:
 * `pnpm contract:update` (e depois `pnpm test`).
 */

type Json = { [key: string]: unknown };
type Shape = {
  types: Set<string>;
  enumValues: Set<string> | null;
  properties: Map<string, Shape>;
  required: Set<string>;
  items: Shape | null;
};

const spec = openapi as unknown as {
  paths: Record<string, Record<string, { operationId: string; responses: Record<string, Json> }>>;
  components: { schemas: Record<string, Json> };
};

/** Resolve `$ref` local (`#/components/schemas/X`). */
function resolve(node: Json): Json {
  const ref = node.$ref;
  if (typeof ref !== 'string') return node;
  const name = ref.replace('#/components/schemas/', '');
  const target = spec.components.schemas[name];
  if (!target) throw new Error(`$ref sem destino: ${ref}`);
  return resolve(target);
}

/** Reduz um JSON Schema ao que importa para o web: tipos, enum, propriedades, obrigatórias e itens. */
function shapeOf(input: Json): Shape {
  const node = resolve(input);
  const shape: Shape = { types: new Set(), enumValues: null, properties: new Map(), required: new Set(), items: null };
  const merge = (part: Shape) => {
    part.types.forEach((t) => shape.types.add(t));
    if (part.enumValues) shape.enumValues = new Set([...(shape.enumValues ?? []), ...part.enumValues]);
    part.properties.forEach((value, key) => shape.properties.set(key, value));
    part.required.forEach((key) => shape.required.add(key));
    if (part.items) shape.items = part.items;
  };
  for (const key of ['anyOf', 'oneOf'] as const) {
    const branches = node[key];
    if (Array.isArray(branches)) branches.forEach((branch) => merge(shapeOf(branch as Json)));
  }
  const type = node.type;
  for (const t of Array.isArray(type) ? type : type ? [type] : []) shape.types.add(t === 'integer' ? 'number' : String(t));
  if (Array.isArray(node.enum)) shape.enumValues = new Set(node.enum.map(String));
  if ('const' in node) shape.enumValues = new Set([String(node.const)]);
  const properties = node.properties as Record<string, Json> | undefined;
  for (const [name, value] of Object.entries(properties ?? {})) shape.properties.set(name, shapeOf(value));
  for (const name of (node.required as string[] | undefined) ?? []) shape.required.add(name);
  if (node.items) shape.items = shapeOf(node.items as Json);
  return shape;
}

const sorted = (values: Iterable<string>) => [...values].sort();

/**
 * Lista de diferenças entre o schema do web e o da API ([] = compatível). O web pode ser mais tolerante em
 * campos obrigatórios (aceita ausência), mas não pode exigir o que a API não garante, nem esperar campos ou
 * valores que ela não envia, nem recusar o que ela envia.
 */
function diff(web: Shape, api: Shape, path: string): string[] {
  const out: string[] = [];
  if (JSON.stringify(sorted(web.types)) !== JSON.stringify(sorted(api.types))) {
    out.push(`${path}: tipos do web [${sorted(web.types)}] ≠ API [${sorted(api.types)}]`);
  }
  if (JSON.stringify(web.enumValues && sorted(web.enumValues)) !== JSON.stringify(api.enumValues && sorted(api.enumValues))) {
    out.push(`${path}: valores do web [${web.enumValues ? sorted(web.enumValues) : '-'}] ≠ API [${api.enumValues ? sorted(api.enumValues) : '-'}]`);
  }
  for (const name of web.properties.keys()) {
    if (!api.properties.has(name)) out.push(`${path}.${name}: o web espera um campo que a API não envia`);
  }
  for (const [name, apiProp] of api.properties) {
    const webProp = web.properties.get(name);
    if (!webProp) {
      out.push(`${path}.${name}: a API envia um campo que o web não declara`);
      continue;
    }
    out.push(...diff(webProp, apiProp, `${path}.${name}`));
    if (web.required.has(name) && !api.required.has(name)) {
      out.push(`${path}.${name}: o web exige o campo, mas na API ele é opcional`);
    }
  }
  if (web.items && api.items) out.push(...diff(web.items, api.items, `${path}[]`));
  else if (Boolean(web.items) !== Boolean(api.items)) out.push(`${path}: itens de lista só de um lado`);
  return out;
}

function responseSchema(operationId: string): Json {
  for (const methods of Object.values(spec.paths)) {
    for (const operation of Object.values(methods)) {
      if (operation.operationId !== operationId) continue;
      const body = (operation.responses['200'] ?? operation.responses['201']) as { content?: { 'application/json'?: { schema: Json } } } | undefined;
      const schema = body?.content?.['application/json']?.schema;
      if (!schema) throw new Error(`${operationId}: sem resposta 200/201 em JSON`);
      return schema;
    }
  }
  throw new Error(`operação ${operationId} não existe no openapi.json`);
}

function webShape(schema: ZodMiniType): Shape {
  // `io: 'input'`: o que o web aceita receber (antes de transformações, como o `signedIn` derivado do pedido).
  return shapeOf(toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Json);
}

describe('contrato do web × openapi.json da API', () => {
  it('a cópia do openapi.json é a da API (OpenAPI 3.1, com operações)', () => {
    expect((openapi as { openapi: string }).openapi).toMatch(/^3\.1/);
    expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
  });

  it('os códigos de erro conhecidos são exatamente o enum ApiError.error da API', () => {
    const apiCodes = sorted(shapeOf(spec.components.schemas.ApiError as Json).properties.get('error')?.enumValues ?? []);
    expect(sorted(knownErrorCodes)).toEqual(apiCodes);
  });

  it('todas as rotas que o web chama existem na API, com o mesmo método', () => {
    const used: Array<[string, string]> = [
      ['POST', '/session'],
      ['GET', '/connections/sigaa/key'],
      ['POST', '/connections/sigaa/unlock'],
      ['DELETE', '/session'],
      ['GET', '/me'],
      ['POST', '/connections/sigaa'],
      ['DELETE', '/connections/sigaa'],
      ['POST', '/connections/sigaa/launch'],
      ['POST', '/connections/moodle/start'],
      ['POST', '/connections/moodle'],
      ['DELETE', '/connections/moodle'],
      ['POST', '/connections/siasb'],
      ['DELETE', '/connections/siasb'],
      ['GET', '/connections/classroom/start'],
      ['DELETE', '/connections/classroom/{email}'],
      ['GET', '/authorize/requests/{id}'],
      ['POST', '/authorize/requests/{id}/approve'],
      ['POST', '/authorize/requests/{id}/deny'],
      ['GET', '/authorized-apps'],
      ['GET', '/me/calendar'],
      ['DELETE', '/authorized-apps/{clientId}'],
      ['DELETE', '/authorized-apps/{clientId}/permissions/{key}'],
      ['POST', '/device/lookup'],
      ['POST', '/device/decision'],
      ['GET', '/memory/status'],
      ['GET', '/memory/computers'],
      ['PATCH', '/memory/computers/{id}'],
      ['DELETE', '/memory/computers/{id}'],
      ['GET', '/memory/projects'],
      ['POST', '/memory/projects'],
      ['GET', '/memory/projects/{id}'],
      ['DELETE', '/memory/projects/{id}'],
      ['PUT', '/memory/projects/{id}/members/{email}'],
      ['DELETE', '/memory/projects/{id}/members/{email}'],
      ['POST', '/memory/projects/{id}/transfer'],
      ['GET', '/admin/team'],
      ['GET', '/admin/team/people'],
      ['PUT', '/admin/team/members/{userId}/roles/{roleKey}'],
      ['DELETE', '/admin/team/members/{userId}/roles/{roleKey}'],
      ['GET', '/admin/memory/sync'],
      ['GET', '/push/config'],
      ['POST', '/me/push-devices'],
      ['GET', '/me/push-devices'],
      ['DELETE', '/me/push-devices/{id}'],
      ['POST', '/me/push-devices/{id}/test'],
      ['GET', '/me/notification-settings'],
      ['PUT', '/me/notification-settings/{key}'],
      ['GET', '/me/academic'],
      ['GET', '/me/academic/curriculum'],
      ['DELETE', '/me/academic'],
      ['DELETE', '/me/academic/draft'],
      ['PUT', '/me/academic/consent'],
      ['POST', '/me/academic/import'],
      ['POST', '/me/academic/confirm'],
    ];
    const missing = used.filter(([method, path]) => !spec.paths[path]?.[method.toLowerCase()]);
    expect(missing).toEqual([]);
  });

  const responses: Array<[string, ZodMiniType]> = [
    ['getMe', meSchema],
    ['createSigaaLaunch', sigaaLaunchSchema],
    ['getAcademic', academicStateSchema],
    ['getAcademicCurriculum', curriculumSchema],
    ['getPushConfig', pushConfigSchema],
    ['registerPushDevice', createdPushDeviceSchema],
    ['listPushDevices', pushDevicesSchema],
    ['listNotificationSettings', notificationSettingsSchema],
    ['listSigaaPasskeys', passkeyListSchema],
    ['getSigaaKey', sigaaKeySchema],
    ['getSigaaPasskeySlot', passkeySlotSchema],
    ['getPairingInfo', pairingInfoSchema],
    ['readPairing', pairingReadSchema],
    ['startMoodle', moodleStartSchema],
    ['getAuthorizationRequest', authorizeRequestSchema],
    ['approveAuthorizationRequest', authorizeDecisionSchema],
    ['denyAuthorizationRequest', authorizeDecisionSchema],
    ['listAuthorizedApps', authorizedAppsSchema],
    ['lookupDevice', deviceLookupSchema],
    ['getMemoryStatus', memoryStatusSchema],
    ['listMemoryComputers', memoryComputersSchema],
    ['listMemoryProjects', memoryProjectsSchema],
    ['createMemoryProject', memoryProjectSchema],
    ['getMemoryProject', memoryProjectDetailSchema],
    ['getAdminTeam', adminTeamSchema],
    ['searchTeamPeople', adminTeamSearchSchema],
    ['getAdminMemorySync', adminMemorySyncSchema],
    ['listAccounts', accountsSchema],
    ['listCourses', coursesSchema],
    ['listDeadlines', deadlinesSchema],
    ['getMeCalendar', myCalendarSchema],
    ['getCourse', courseActivitiesSchema],
    ['getForum', forumSchema],
    ['getAnnouncement', announcementSchema],
  ];

  /**
   * Divergências que o web assume de propósito (e só estas). `key` da permissão é enum fechado na API, mas texto livre
   * no web: com enum fechado, uma chave nova da API quebraria a lista inteira em quem ainda não atualizou o web, e a
   * spec pede que fontes novas apareçam sem trabalho no web. O mesmo vale para a `key` dos ajustes de aviso e das
   * permissões por app (oferecidas no pedido de autorização e liberadas em Apps autorizados).
   */
  const ACCEPTED_DIVERGENCES = [
    'listNotificationSettings.items[].key: valores do web',
    'getAuthorizationRequest.permissions[].key: valores do web',
    'listAuthorizedApps.apps[].permissions[].key: valores do web',
  ];

  it.each(responses)('a resposta de %s tem o formato que o web espera', (operationId, schema) => {
    const found = diff(webShape(schema), shapeOf(responseSchema(operationId)), operationId);
    expect(found.filter((line) => !ACCEPTED_DIVERGENCES.some((accepted) => line.startsWith(accepted)))).toEqual([]);
  });

  it('as divergências aceitas ainda existem (se a API mudar, tire a exceção)', () => {
    const found = [
      ...diff(webShape(notificationSettingsSchema), shapeOf(responseSchema('listNotificationSettings')), 'listNotificationSettings'),
      ...diff(webShape(authorizeRequestSchema), shapeOf(responseSchema('getAuthorizationRequest')), 'getAuthorizationRequest'),
      ...diff(webShape(authorizedAppsSchema), shapeOf(responseSchema('listAuthorizedApps')), 'listAuthorizedApps'),
    ];
    for (const accepted of ACCEPTED_DIVERGENCES) {
      expect(found.some((line) => line.startsWith(accepted)), `exceção sem efeito: ${accepted}`).toBe(true);
    }
  });
});
