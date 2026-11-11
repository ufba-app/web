import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { renderToString } from 'react-dom/server';
import { AppRow, Button, Dialog, formatDay, ServiceIcon } from '../../src';

const css = (f: string) => readFileSync(resolve(__dirname, '../../src/styles', f), 'utf8');
const block = (c: string, sel: string) => {
  const i = c.indexOf(`${sel} {`);
  return i < 0 ? '' : c.slice(i, c.indexOf('}', i));
};

test('domínio de retorno e meta do app quebram linha em vez de sair da tela', () => {
  expect(block(css('auth.css'), '.ufba-request__return')).toContain('overflow-wrap: anywhere');
  expect(block(css('auth.css'), '.ufba-request__text')).toContain('min-width: 0');
  expect(block(css('app.css'), '.ufba-app-row__meta')).toContain('overflow-wrap: anywhere');
});

test('e-mail longo da conta pessoal não espreme a coluna', () => {
  expect(block(css('connections.css'), '.ufba-account__text')).toContain('flex: 1 1 180px');
});

test('e-mail da AccountLine quebra linha', () => {
  expect(block(css('auth.css'), '.ufba-account-line strong')).toContain('overflow-wrap: anywhere');
});

test('ícones repetidos na mesma página têm ids próprios', () => {
  const { container } = render(
    <>
      <ServiceIcon service="moodle" />
      <ServiceIcon service="moodle" />
      <ServiceIcon service="sigaa" />
      <ServiceIcon service="sigaa" />
      <ServiceIcon service="classroom" />
      <ServiceIcon service="classroom" />
    </>,
  );
  const ids = [...container.querySelectorAll('[id]')].map((e) => e.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const svg of container.querySelectorAll('svg')) {
    const local = new Set([...svg.querySelectorAll('[id]')].map((e) => e.id));
    const refs = [...svg.innerHTML.matchAll(/url\(#([^)]+)\)|href="#([^"]+)"/g)].map((m) => m[1] ?? m[2]);
    for (const r of refs) expect(local.has(r as string), r).toBe(true);
  }
});

test('formatDay usa o fuso da UFBA, não o do servidor', () => {
  expect(formatDay(new Date('2026-11-05T01:00:00Z'))).toBe('4 nov');
});

test('HTML do servidor do AppRow não depende do relógio', () => {
  const html = renderToString(
    <AppRow name="Claude" returnDomain="claude.ai" authorizedAt={new Date('2026-11-04T13:00:00Z')} lastUsedAt={new Date()} onRevoke={() => {}} />,
  );
  expect(html).toContain('4 nov');
  expect(html).not.toMatch(/usado/);
});

test('diálogo: foco entra, Esc fecha e o foco volta ao botão que abriu', async () => {
  function Demo() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onPress={() => setOpen(true)}>Revogar</Button>
        <Dialog isOpen={open} onOpenChange={setOpen} title="Revogar o Claude?" actions={<Button>Revogar acesso</Button>}>
          <p>Ele perde o acesso na hora.</p>
        </Dialog>
      </>
    );
  }
  render(<Demo />);
  const trigger = screen.getByRole('button', { name: 'Revogar' });
  await userEvent.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: 'Revogar o Claude?' });
  expect(dialog.contains(document.activeElement)).toBe(true);
  await userEvent.keyboard('{Escape}');
  await act(async () => {
    await new Promise((r) => setTimeout(r, 400));
  });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(trigger).toHaveFocus();
});
