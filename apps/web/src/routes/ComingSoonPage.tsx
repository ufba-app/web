import { EmptyState, PageHeader } from '@ufba-app/web-ui';
import { useDocumentTitle } from '../lib/useDocumentTitle';

/** Parte do menu que ainda não tem tela. Evita link morto. */
export function ComingSoonPage({ title }: { title: string }) {
  useDocumentTitle(title);
  return (
    <>
      <PageHeader title={title} />
      <EmptyState title="Em breve" description="Esta parte do ufba.app ainda está sendo preparada." />
    </>
  );
}
