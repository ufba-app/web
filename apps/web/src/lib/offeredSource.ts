import type { Me } from '../contract';

/**
 * A pessoa tem acesso a esta fonte? Só o SIASB depende de oferta (`connections.siasb.offered`: só quem tem matrícula na
 * clínica o recebe). Qualquer coisa do SIASB (permissões, avisos) NÃO aparece para quem não tem acesso. Fonte que o web
 * ainda não conhece conta como oferecida: a API manda, e uma fonte nova não pode sumir por falta de código aqui.
 */
export function isSourceOffered(me: Me, source: string): boolean {
  return source === 'siasb' ? me.connections.siasb.offered : true;
}
