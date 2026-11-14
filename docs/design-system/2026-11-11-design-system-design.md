# Design System do ufba.app: especificação

Data: 2026-11-11
Estado: rascunho para revisão
Referência visual: canvas "UFBA Design System" (https://claude.ai/artifact/Poex2vk8TwyK3L1k4pZ9Dy)
Telas de origem: canvas "UFBA App — Telas web" (https://claude.ai/artifact/D1Cpxoey269wvVohLwZbBL)

## 1. Objetivo

Entregar no repositório `ufba-app/design-system` duas coisas:

1. **Tokens** de cor, tipografia, raio e espaçamento, num formato que o `web` e o `mobile` consomem.
2. **Uma biblioteca de componentes React para o `web`**, construída sobre HeroUI v3, com todas as peças que as telas web do artefato de referência pedem.

O mobile continua montando seus próprios componentes com HeroUI Native. Ele consome só os tokens.

### O que foi dito e o que é suposição

Dito pelo dono do projeto:
- O design system é baseado em HeroUI.
- Deve conter tokens e componentes web.
- A direção visual é a do canvas de referência, fechada em seis rodadas: página branca, cartões de borda fina sem sombra, cantos de 20px, números grandes em Sora, texto em Plus Jakarta Sans, azul-marinho `#1b2a7a` como cor principal, amarelo `#ffc93c` só para o que é agora ou está no limite, um ícone por disciplina numa cor só, um único círculo amarelo de grafismo por tela.
- Light mode basta.

Suposições desta especificação (cada uma pode ser corrigida na revisão):
- HeroUI **v3** (`@heroui/react` + `@heroui/styles`, Tailwind CSS v4, React Aria). É a versão atual e a que o `docs` cita como "HeroUI React".
- O `web` é Next.js (dito no `docs`) e vai importar o pacote como dependência npm.
- O tema escuro ("Noite") das telas de referência fica **fora** desta versão. Os tokens são organizados para recebê-lo depois sem mudar nomes.

Decidido na revisão: **sem Storybook nem qualquer interface de catálogo.** O repositório entrega só os pacotes. A referência visual é o canvas de design; o uso de cada componente fica documentado no README do pacote e nos testes.

### Mudança de documentação que acompanha

O `docs` hoje diz que o `design-system` guarda "tokens de design e guia visual" e que web e mobile não compartilham componentes. Isso continua verdade para o mobile, mas o repositório passa a ter também a biblioteca web. A página "Visão geral" do `docs` é atualizada no mesmo ciclo (PR separado no repo `docs`).

## 2. Estrutura do repositório

Monorepo com pnpm workspaces:

```
design-system/
  packages/
    tokens/        @ufba-app/tokens   — fonte única dos tokens; gera CSS, TS e JSON
    web/           @ufba-app/web-ui   — componentes React sobre HeroUI v3
  docs/specs/      esta especificação e as próximas
```

- `@ufba-app/tokens` não depende de React nem de HeroUI.
- `@ufba-app/web-ui` depende de `@ufba-app/tokens`, `@heroui/react`, `@heroui/styles` e React 19 como peer.
- Publicação no GitHub Packages (npm) a cada tag `v*`, por GitHub Actions. Versionamento com Changesets.

## 3. Tokens

Fonte única em TypeScript (`packages/tokens/src/*.ts`). Um script de build gera:

- `tokens.css`: variáveis CSS no formato que o HeroUI v3 lê (`--accent`, `--background`, `--radius`...) mais as variáveis próprias do sistema.
- `tokens.json`: valores planos para o mobile (HeroUI Native) e para o canvas de design.
- `index.ts`: os mesmos valores tipados, para quem precisa deles em JS.

### Cor

| Token | Valor | Uso |
|---|---|---|
| `background` | `#ffffff` | página e cartões |
| `foreground` | `#1b2a7a` | texto principal |
| `accent` (marinho) | `#1b2a7a` | botão principal, seleção forte, aula de agora |
| `accent-foreground` | `#ffffff` | texto sobre marinho |
| `highlight` (amarelo) | `#ffc93c` | agora, prazo próximo, limite de faltas, grafismo |
| `highlight-foreground` | `#1b2a7a` | texto sobre amarelo |
| `muted` | `#4d5680` | texto de apoio (contraste 7,4:1 sobre branco) |
| `surface-soft` (névoa) | `#eef1fb` | fundo de ícone, item selecionado, trilhos |
| `border` | `#dfe3f0` | contorno de cartões, campos e divisórias |
| `success` / `success-soft` | `#146c43` / `#e3f6ec` | deu certo |
| `danger` / `danger-soft` | `#b3261e` / `#fde8e6` | erro |

Regra: o amarelo nunca é cor de texto. O vermelho só aparece em erro, nunca em prazo.

### Tipografia

- Título e número: **Sora**, pesos 600 e 800, `letter-spacing` negativo em tamanhos grandes.
- Texto: **Plus Jakarta Sans**, pesos 500, 700 e 800.
- Escala (px): 12, 13, 14, 15, 19, 24, 32, 36 (número de cartão), 76 (hora da aula de agora).
- Números sempre com `tabular-nums`.
- As fontes são carregadas pelo app (`next/font` no web); o pacote só declara as famílias.

### Raio, borda, espaçamento

- `--radius: 20px` (cartões, botões, campos). Derivados do HeroUI: `sm` 10, `md` 15, `lg` 20, `xl` 30. Selos e pílulas: totalmente redondos.
- Borda: sempre 1px `border`. **Nenhuma sombra** em nenhum componente.
- Espaçamento em passos de 4px; os mais usados são 8, 12, 16, 22, 24 e 32.
- Alvo de toque mínimo de 44px.

## 4. Componentes web

Duas camadas:

- **Tema dos componentes HeroUI**: o pacote importa `@heroui/styles` e sobrescreve tokens e classes para que os componentes do HeroUI já saiam com a cara do sistema. O app usa o componente do HeroUI diretamente quando ele basta.
- **Componentes próprios**: peças que o HeroUI não tem, ou composições que se repetem em várias telas. Montados com primitivos do HeroUI por baixo sempre que houver um.

### 4.1 Componentes do HeroUI só com tema

Button, Chip, Input e TextField, Kbd, Tabs, Card, Avatar, Checkbox, Link, Tooltip, Modal, Toast, Skeleton, Separator, ProgressBar.

Variantes de Button: `primary` (marinho cheio), `outline` (borda), `highlight` (amarelo), `ghost` (só texto sublinhado), `danger`; tamanhos `sm` e `md`; estado `isPending`. O HeroUI v3 não tem variante amarela: `highlight` é uma classe nova (`.button--highlight`) criada no tema, e o pacote exporta um `Button` próprio que aceita esse valor.
Variantes de Chip: `neutral` (borda), `highlight`, `success`, `danger`, `solid` (marinho).

### 4.2 Componentes próprios

Agrupados pelas telas onde aparecem. Cada um tem testes e uma entrada no README do pacote.

**Estrutura de aplicação**
- `AppShell`: navegação lateral mais área de conteúdo; vira barra superior abaixo de 820px.
- `SideNav`, `SideNavItem`, `SideNavGroup`: itens com ícone, contador e estado atual.
- `UserBadge`: avatar, nome, matrícula e curso.
- `PageHeader`: saudação ou título, linha de apoio e área de ações.
- `SyncStatus`: "Sincronizado há N min" mais o botão Atualizar.
- `SearchField`: campo de busca com atalho Ctrl K.

**Disciplina e tempo**
- `CourseIcon`: ícone da disciplina em fundo névoa, tamanhos `sm` 26, `md` 36, `lg` 58. Recebe o ícone; o mapa disciplina → ícone fica no app.
- `NowCard`: o cartão principal da aula de agora, com hora grande, disciplina, local e o círculo amarelo.
- `DayTrack`: a faixa do dia com blocos de aula, monitoria tracejada e o ponto amarelo de agora.
- `WeekGrid`, `WeekEvent`: grade semanal com coluna de hoje, linha de agora e evento destacado. Aceita choque de horário (`clash`).
- `Timeline` da trajetória: nós do fluxograma do curso nos estados `done`, `now`, `open` e `locked`.

**Números e progresso**
- `StatCard` e `StatGroup`: rótulo, número grande com unidade, selo e linha de apoio; o grupo divide os números por réguas verticais.
- `BigNumber`: o número grande sozinho.
- `SegmentMeter`: medidor em segmentos de unidade real (horas de falta, semanas do semestre).
- `AbsenceCard`: faltas de uma disciplina com o medidor e a mensagem de quanto ainda pode faltar.

**Listas**
- `ListRow`: ícone de disciplina, título, linha de apoio e selo opcional.
- `DueList`, `DueRow`: lista de prazos ordenada por data; o mais próximo ganha o selo amarelo.
- `FeedItem`: item de novidade (nota publicada, prazo mudou, material novo, aviso).
- `Quote`: aviso de professor citado, com autor e origem.

**Dados**
- `DataTable`: tabela de histórico e notas, com cabeçalho, rodapé de totais e rolagem horizontal em telas estreitas. Sobre o `Table` do HeroUI.
- `Legend`: legenda de situação (aprovado, reprovado, trancado, cursando).
- `ProfessorCard`: professor, disciplinas e contato.
- `DocumentRow`: documento emitido (atestado, histórico) com ação de baixar.

**Fluxo de autorização (OAuth)**
- `AuthLayout`: duas colunas, apresentação à esquerda e formulário à direita; uma coluna no celular.
- `Stepper`: Entrar, Conectar fontes, Autorizar.
- `ClientRequest`: "Claude quer acessar seus dados" com a inicial do app cliente.
- `SourceCard`: uma fonte (Google, SIGAA, Moodle) com escopo, estado conectado ou não e ação.
- `FormError` e `FieldError`: mensagem de erro de formulário e de campo.
- `GoogleButton`: entrar com a conta institucional.

**Estados**
- `EmptyState`: título, uma linha e uma ação.
- `ErrorState`: página de erro (transação expirada, pedido não encontrado) com o que aconteceu e o que fazer.
- `Callout`: aviso em linha nas variantes `info`, `success`, `warning`, `danger`.

**Landing**
- `Hero`, `FeatureStrip`, `LandingNav`: os blocos da página pública.

### 4.3 Grafismo

O círculo amarelo é um componente (`Accent circle`, interno ao `NowCard` e ao `Hero`), não um estilo solto. Regra documentada: no máximo um por tela.

## 5. Acessibilidade

- Contraste mínimo 4,5:1 para texto; todos os pares de cor da tabela acima passam.
- Foco visível em tudo que é interativo (contorno marinho de 2px com afastamento).
- Componentes interativos herdam o comportamento de teclado do React Aria via HeroUI.
- Informação nunca só por cor: prazo urgente tem selo com texto; disciplina tem ícone e código.
- `prefers-reduced-motion` respeitado em qualquer transição.

## 6. Testes e qualidade

- Vitest com Testing Library para comportamento dos componentes próprios.
- Teste de acessibilidade automatizado (axe) no teste de cada componente.
- Teste dos tokens: o build gera os três formatos e um teste confere que os valores batem entre eles.
- Lint (ESLint) e checagem de tipos no CI de cada PR.
- Teste visual por captura fica para depois da primeira versão.

## 7. Fora do escopo desta versão

- Tema escuro.
- Componentes do mobile.
- Integração do pacote no repositório `web` (é o passo seguinte, noutro repo).
- Telas inteiras: o pacote entrega peças; montar as páginas é trabalho do `web`.

## 8. Entregas, em ordem

1. Monorepo, CI, Changesets e publicação.
2. `@ufba-app/tokens` com os três formatos gerados.
3. Tema do HeroUI e os componentes da seção 4.1, com testes.
4. Componentes próprios, na ordem: estrutura de aplicação; disciplina e tempo; números; listas; autorização; dados; estados; landing.
5. PR no `docs` atualizando a visão geral.

Cada entrega é um PR contra a `main`, como pede o guia de contribuição.

## 9. Pontos em aberto

- O mapa disciplina → ícone: definido pelo app, por uma regra (área do conhecimento) ou escolhido pelo aluno.
- Nome do pacote web: `@ufba-app/web-ui` é proposta.
- Registro de publicação: GitHub Packages é proposta; npm público é alternativa, já que os repos são públicos.
