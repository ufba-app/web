import { z } from 'zod/mini';

/**
 * O zod 4 compila validadores com `new Function` (JIT). A CSP de produção proíbe `eval`, então usamos o modo sem JIT.
 * Este módulo precisa ser o PRIMEIRO import do app: os schemas são construídos quando os módulos são importados,
 * e é nesse momento que o zod decide se usa JIT.
 *
 * Usamos `zod/mini` (API funcional, sem métodos encadeados) porque ele se presta ao tree-shaking: só entra no bundle
 * o que os schemas usam. Ver docs/performance.md.
 */
z.config({ jitless: true });
