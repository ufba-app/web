import './opening.css';
import { runOpening } from './openingPage';

// Entrada própria do Vite (opening.html): sem script inline, para a CSP do painel continuar estrita.
const root = document.getElementById('opening');
if (root) void runOpening(root);
