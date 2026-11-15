/**
 * Entrada à parte do interruptor (`@ufba-app/web-ui/switch`), fora do índice principal de propósito: o Switch do HeroUI
 * (react-aria) pesa uns 3 kB e quase nenhuma tela usa. Pelo índice ele entraria no código da primeira carga de todo
 * o painel; por aqui só baixa junto com a página que o usa (hoje, Conexões).
 */
export { Switch, type SwitchProps } from './components/Switch';
