// Título digitado da abertura. Melhoria progressiva: sem JS (ou com "reduzir movimento") o título fica
// parado em "Seu semestre num lugar só." e a página inteira funciona igual.
(function () {
  var alvo = document.getElementById('lp-typed');
  if (!alvo || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  var frases = ['Seu semestre', 'Seus prazos', 'Suas provas', 'Suas matérias', 'Seus avisos', 'Suas tarefas', 'Seus materiais'];
  var esp = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
  var comum = function (a, b) { var k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++; return k; };
  async function rodar() {
    var atual = 'Seu semestre';
    var i = 1;
    await esp(2200);
    for (;;) {
      var fim = frases[i % frases.length];
      var k = comum(atual, fim);
      while (atual.length > k) { atual = atual.slice(0, -1); alvo.textContent = atual; await esp(38); }
      while (atual.length < fim.length) { atual = fim.slice(0, atual.length + 1); alvo.textContent = atual; await esp(70 + Math.random() * 60); }
      await esp(1700);
      i++;
    }
  }
  rodar();
})();
