test('exporta tudo da seção 4.1', async () => {
  const m: Record<string, unknown> = await import('../src');
  for (const n of ['Button', 'Chip', 'Input', 'TextField', 'Kbd', 'Tabs', 'Card', 'Avatar',
    'Checkbox', 'Link', 'Tooltip', 'Modal', 'Toast', 'Skeleton', 'Separator', 'ProgressBar']) {
    expect(m[n], n).toBeDefined();
  }
});
