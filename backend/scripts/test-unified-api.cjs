const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const credentials = JSON.parse(fs.readFileSync(path.join(root, '.local/unified-test-credentials.json')));
const base = 'http://127.0.0.1:8102';
const suffix = Date.now().toString(36);
let checks = 0;

async function call(route, token, method = 'GET', body, expected = 200) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(base + route, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  assert.equal(response.status, expected, `${method} ${route}: expected ${expected}, received ${response.status}`);
  checks++;
  const text = await response.text();
  try { return JSON.parse(text); } catch { return text; }
}
const login = async (username) => (await call('/auth/login', null, 'POST', { username, password: credentials.password }, 200));

async function upload(token, label, value) {
  const form = new FormData();
  form.append('title', label);
  form.append('file', new Blob([`Kebijakan tunjangan karyawan. Nilai tunjangan karyawan adalah ${value} rupiah per bulan. Dokumen ${label}.`], { type: 'text/plain' }), label + '.txt');
  return call('/documents', token, 'POST', form, 201);
}

async function main() {
  const owner = await login(credentials.username);
  assert.equal(owner.user.isPlatformOwner, true);
  const organizations = [];
  for (const label of ['alpha', 'beta']) {
    const username = `${label}_${suffix}`;
    const workspace = await call('/workspaces', owner.accessToken, 'POST', { name: `Test ${label} ${suffix}`, adminName: `Admin ${label}`, adminUsername: username, adminPassword: credentials.password, ...(label === 'beta' ? { employeeNumber: 'ADM-01', division: 'Operations', jobTitle: 'Administrator' } : {}) }, 201);
    const admin = await login(username);
    assert.equal(admin.user.workspaceId, workspace.id);
    assert.equal(admin.user.isPlatformOwner, false);
    await call('/users', admin.accessToken, 'POST', { username: `incomplete_${label}_${suffix}`, displayName: 'Incomplete employee', password: credentials.password, role: 'PEGAWAI' }, 400);
    const employeeUsername = `staff_${label}_${suffix}`;
    const employee = await call('/users', admin.accessToken, 'POST', { username: employeeUsername, displayName: `Staff ${label}`, password: credentials.password, employeeNumber: 'EMP-01', division: 'Operations', jobTitle: 'Employee', role: 'PEGAWAI' }, 201);
    const employeeLogin = await login(employeeUsername);
    const category = await call('/documents/categories', admin.accessToken, 'POST', { name: `Common ${suffix}` }, 201);
    organizations.push({ workspace, admin, employee, employeeLogin, category });
  }
  console.log('PASS organization provisioning and direct-login workspace binding');
  const personal = [];
  for (const label of ['one', 'two']) {
    const username = `personal_${label}_${suffix}`;
    const email = `${username}@example.invalid`;
    const account = await call('/auth/register/personal', null, 'POST', { displayName: `Personal ${label}`, username, email, password: credentials.password, confirmPassword: credentials.password }, 201);
    assert.equal(account.user.accountType, 'PERSONAL');
    assert.equal(account.user.isAdmin, false);
    assert.equal(account.user.username, username);
    const passwordLogin = await login(username);
    assert.equal(passwordLogin.user.id, account.user.id);
    personal.push(account);
  }
  assert.notEqual(personal[0].user.workspaceId, personal[1].user.workspaceId);
  await call('/auth/register/personal', null, 'POST', { displayName: 'Invalid admin', username: `bad_${suffix}`, email: `bad_${suffix}@example.invalid`, password: credentials.password, confirmPassword: credentials.password, isAdmin: true, workspaceId: organizations[0].workspace.id }, 400);
  for (const account of personal) {
    await call('/users', account.accessToken, 'GET', undefined, 403);
    await call('/workspaces', account.accessToken, 'GET', undefined, 403);
    await call('/required-readings/report', account.accessToken, 'GET', undefined, 403);
    await call('/messaging/conversations', account.accessToken, 'GET', undefined, 403);
  }
  console.log('PASS personal registration creates separate private spaces and rejects elevated access');

  const [a, b] = organizations;
  const people = await call('/users', a.admin.accessToken);
  assert(people.some((person) => person.id === a.employee.id));
  assert(!people.some((person) => person.id === b.employee.id));
  await call(`/users/${b.employee.id}`, a.admin.accessToken, 'PUT', { displayName: 'Intruder' }, 404);
  await call(`/users/${b.employee.id}/password`, a.admin.accessToken, 'PUT', { newPassword: credentials.password }, 404);
  await call(`/users/${b.employee.id}`, a.admin.accessToken, 'DELETE', undefined, 404);
  await call('/workspaces', a.admin.accessToken, 'POST', { name: 'Invalid' }, 400);
  await call('/workspaces', a.admin.accessToken, 'GET', undefined, 403);
  const categories = await call('/documents/categories', a.admin.accessToken);
  assert(categories.some((item) => item.id === a.category.id));
  assert(!categories.some((item) => item.id === b.category.id));

  const docs = [await upload(a.admin.accessToken, `alpha_${suffix}`, '111111'), await upload(b.admin.accessToken, `beta_${suffix}`, '999999'), await upload(personal[0].accessToken, `personal_${suffix}`, '222222'), await upload(personal[1].accessToken, `personal_${suffix}`, '222222')];
  const actors = [a.admin, b.admin, ...personal];
  for (let i = 0; i < actors.length; i++) {
    const documents = await call('/documents', actors[i].accessToken);
    assert(documents.some((item) => item.id === docs[i].id));
    for (let j = 0; j < docs.length; j++) if (j !== i) {
      assert(!documents.some((item) => item.id === docs[j].id));
      await call(`/documents/${docs[j].id}/download`, actors[i].accessToken, 'GET', undefined, 404);
      await call(`/documents/${docs[j].id}/chunks`, actors[i].accessToken, 'GET', undefined, 404);
      await call(`/documents/${docs[j].id}`, actors[i].accessToken, 'PATCH', { title: 'Intruder' }, 404);
      await call(`/documents/${docs[j].id}`, actors[i].accessToken, 'DELETE', undefined, 404);
    }
  }
  await call(`/documents/${docs[0].id}/access`, a.admin.accessToken, 'PATCH', { categoryId: b.category.id }, 403);
  await call(`/documents/${docs[2].id}`, personal[0].accessToken, 'PATCH', { title: 'My private document' });
  console.log('PASS document ownership, duplicate detection boundaries, download, chunks, edits, deletion, and category isolation');

  for (let i = 0; i < docs.length; i++) {
    let ready = false;
    for (let attempt = 0; attempt < 90; attempt++) {
      const state = await call(`/documents/${docs[i].id}/status`, actors[i].accessToken);
      if (state.status === 'READY') { ready = true; break; }
      assert.notEqual(state.status, 'FAILED', 'Document ingestion failed for fixture ' + i);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert(ready, 'Document ingestion did not finish');
  }
  await call(`/required-readings/documents/${docs[0].id}/assign`, a.admin.accessToken, 'POST', { userIds: [b.employee.id] }, 400);
  await call(`/required-readings/documents/${docs[0].id}/assign`, a.admin.accessToken, 'POST', { userIds: [a.employee.id] }, 201);
  await call(`/required-readings/documents/${docs[0].id}/assign`, a.admin.accessToken, 'POST', { userIds: [a.employee.id] }, 400);
  const readings = await call('/required-readings/mine', a.employeeLogin.accessToken);
  assert.equal(readings.length, 1);
  await call(`/required-readings/${readings[0].id}/complete`, a.employeeLogin.accessToken, 'POST', {}, 400);
  await call(`/required-readings/${readings[0].id}/progress`, a.employeeLogin.accessToken, 'POST', { progress: 99 }, 201);
  await call(`/required-readings/${readings[0].id}/complete`, a.employeeLogin.accessToken, 'POST', {}, 201);
  assert.equal((await call('/required-readings/report', a.admin.accessToken))[0].completed, 1);
  assert.equal((await call('/required-readings/report', b.admin.accessToken)).length, 0);
  console.log('PASS ingestion and required-reading assignment, duplicate protection, completion and reports');

  const announcement = await call('/announcements', a.admin.accessToken, 'POST', { title: 'Alpha announcement', body: 'Only alpha employees.' }, 201);
  assert((await call('/announcements', a.employeeLogin.accessToken)).some((item) => item.id === announcement.id));
  assert(!(await call('/announcements', b.admin.accessToken)).some((item) => item.id === announcement.id));
  await call(`/announcements/${announcement.id}`, b.admin.accessToken, 'PATCH', { title: 'Intruder' }, 404);
  const conversation = await call(`/messaging/employee/${a.employee.id}`, a.employeeLogin.accessToken);
  await call(`/messaging/${conversation.id}/messages`, b.admin.accessToken, 'GET', undefined, 404);
  await call(`/messaging/employee/${a.employee.id}`, b.admin.accessToken, 'GET', undefined, 404);
  await call(`/messaging/${conversation.id}/messages`, a.employeeLogin.accessToken, 'POST', { content: 'Private alpha message' }, 201);
  assert.equal((await call('/messaging/conversations', b.admin.accessToken)).length, 0);
  console.log('PASS announcements and messaging organization boundaries');

  for (let i = 0; i < actors.length; i++) {
    const answer = await call('/chat/query', actors[i].accessToken, 'POST', { question: 'Berapa nilai tunjangan karyawan?' }, 201);
    assert(answer.citations.length > 0, 'Expected citations for own document');
    assert(answer.citations.every((citation) => citation.documentId === docs[i].id));
    if (i !== 1) assert(!answer.answer.includes('999999'), 'Foreign document leaked into answer');
  }
  console.log('PASS real AI retrieval and citation isolation for two organizations and two personal accounts');
  fs.writeFileSync(path.join(root, '.local/unified-test-sessions.json'), JSON.stringify({ owner, organizations, personal, docs, password: credentials.password }));
  fs.writeFileSync(path.join(root, '.local/unified-api-results.json'), JSON.stringify({ checks, passed: true, at: new Date().toISOString() }));
  console.log(`PASS ${checks} HTTP checks plus response assertions`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
