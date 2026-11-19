// Avaliação técnica (resultado da entrega final): cada equipe consulta só a própria nota, informando o nome da equipe e
// o e-mail de um integrante. As notas ficam na aba "Avaliação técnica" (fora do site e do repositório público). Vem só da função
// do site, com a mesma chave do sorteio. Só leitura: não grava nada na planilha
const EVALUATION_SHEET = 'Avaliação técnica';
const EVALUATION_HEADERS = [
  'Posição',
  'Equipe',
  'Projeto',
  'Tema',
  'Aderência',
  'Implementação',
  'Inovação',
  'UX',
  'Pitch',
  'Soma',
  'Penalidade',
  'Nota',
  'Finalista',
  'Resumo',
];
const EVALUATION_CACHE_SECONDS = 300;

function evaluationAction_(body) {
  if (!drawAuthorized_(body.token)) return json_({ ok: false, error: 'unauthorized' });
  if (body.action !== 'evaluation-lookup') return json_({ ok: false, error: 'unknown-action' });
  try {
    return json_(evaluationLookup_(SpreadsheetApp.getActiveSpreadsheet(), body));
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'server' });
  }
}

// "Equipe Hypno", "hypno" e " HYPNO " são a mesma equipe
function evaluationTeamKey_(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^\s*equipe\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function evaluationNumber_(value) {
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return isFinite(n) ? n : 0;
}

// e-mails por equipe (Inscritos, sem cancelados), guardados 5 min no cache: a consulta de 47 equipes ao mesmo tempo
// não relê a planilha a cada pedido
function evaluationMembers_(book) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('evaluation:members:v1');
  if (cached) return JSON.parse(cached);
  const sheet = book.getSheetByName(REGISTRATIONS_SHEET);
  const members = {};
  readRows_(sheet, REGISTRATION_HEADERS.length).forEach((r) => {
    const team = evaluationTeamKey_(r[RCOL.team]);
    const email = drawText_(r[RCOL.email]).toLowerCase();
    if (!team || !email || drawStatus_(r[RCOL.status]) === 'cancelado') return;
    (members[team] = members[team] || []).push(email);
  });
  cache.put('evaluation:members:v1', JSON.stringify(members), EVALUATION_CACHE_SECONDS);
  return members;
}

function evaluationRows_(book) {
  const sheet = book.getSheetByName(EVALUATION_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, EVALUATION_HEADERS.length).getValues();
  return values.filter((r) => drawText_(r[1]));
}

function evaluationLookup_(book, body) {
  const team = evaluationTeamKey_(body.team);
  const email = drawText_(body.email).toLowerCase();
  if (!team || !email) return { ok: false, error: 'not-found' };
  const emails = evaluationMembers_(book)[team] || [];
  if (emails.indexOf(email) === -1) return { ok: false, error: 'not-found' };
  const rows = evaluationRows_(book);
  if (!rows) return { ok: false, error: 'server' };
  const row = rows.find((r) => evaluationTeamKey_(r[1]) === team);
  if (!row) return { ok: false, error: 'not-found' };
  return {
    ok: true,
    total: rows.length,
    result: {
      rank: evaluationNumber_(row[0]),
      team: drawText_(row[1]).replace(/^\s*equipe\s+/i, ''),
      project: drawText_(row[2]),
      theme: drawText_(row[3]),
      scores: {
        adherence: evaluationNumber_(row[4]),
        implementation: evaluationNumber_(row[5]),
        innovation: evaluationNumber_(row[6]),
        ux: evaluationNumber_(row[7]),
        pitch: evaluationNumber_(row[8]),
      },
      sum: evaluationNumber_(row[9]),
      penalty: evaluationNumber_(row[10]),
      grade: evaluationNumber_(row[11]),
      finalist: /^sim$/i.test(drawText_(row[12])),
      summary: drawText_(row[13]),
    },
  };
}
