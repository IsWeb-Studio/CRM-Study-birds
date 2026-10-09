import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebsiteClient, mountWebsiteRoutes, websiteConfig } from './website.service.js';

const id = 'a'.repeat(24);
const config = () => ({ enabled: true, ready: true, baseUrl: 'https://website.example/api', token: 'test-token' });
const response = data => ({ ok: true, status: 200, json: async () => data });

test('disabled integration needs no URL or token; validates enabled URLs', () => {
  assert.deepEqual(websiteConfig({}), { enabled: false, ready: false });
  assert.throws(() => websiteConfig({ STUDY_BIRDS_ENABLED: 'true', STUDY_BIRDS_API_URL: 'http://remote.example/api' }));
  assert.throws(() => websiteConfig({ STUDY_BIRDS_ENABLED: 'true', STUDY_BIRDS_API_URL: 'https://user:pass@remote.example/api' }));
  assert.equal(websiteConfig({ STUDY_BIRDS_ENABLED: 'true', STUDY_BIRDS_API_URL: 'http://localhost:4000/api', STUDY_BIRDS_API_TOKEN: 'test' }).ready, true);
});
test('catalog reads every page, preserves website ids and distinct language variants, caches reads', async () => {
  const calls = [];
  const client = createWebsiteClient({ config, fetchImpl: async (url, options) => {
    calls.push(url);
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.equal(options.redirect, 'error');
    const path = new URL(url).pathname;
    if (path.endsWith('/countries')) return response([{ _id: 'c1', name: 'Turkey' }]);
    if (path.endsWith('/universities')) return response([{ _id: 'u1', name: 'University', country: { name: 'Turkey' } }]);
    if (path.endsWith('/scholarships/manage')) return response([{_id:'s1',title:'Website scholarship'}]);
    const page = Number(new URL(url).searchParams.get('page'));
    return response({ items: [{ _id: `p${page}`, title: 'Medicine', university: 'u1', degreeLevel: 'Bachelor', language: page === 1 ? 'English' : 'Turkish', tuition: 5000 }], pagination: { totalPages: 2, hasNextPage: page === 1 } });
  } });
  const catalog = await client.catalog();
  assert.equal(catalog.programs.length, 2);
  assert.notEqual(catalog.programs[0].department, catalog.programs[1].department);
  assert.equal(catalog.programs[0].id, 'p1');
  assert.equal(catalog.programs[0].universityId, 'u1');
  await client.catalog();
  assert.equal(calls.length, 5);
  assert.equal(catalog.scholarships[0].name,'Website scholarship');
});
test('object-shaped financial endpoint extracts invoices and payment proofs separately', async () => {
  const client = createWebsiteClient({ config, fetchImpl: async () => response({ invoices: [{ _id: 'invoice' }], paymentProofs: [{ _id: 'proof' }] }) });
  assert.equal((await client.resource('financials')).rows[0]._id, 'invoice');
  assert.equal((await client.resource('paymentProofs')).rows[0]._id, 'proof');
});
test('write whitelist rejects arbitrary fields, resources, actions and path injection', async () => {
  let calls = 0;
  const client = createWebsiteClient({ config, fetchImpl: async () => { calls++; return response({}); } });
  await assert.rejects(client.action('applications', '../bad', 'status', { status: 'accepted' }));
  await assert.rejects(client.action('applications', id, 'delete', {}));
  await assert.rejects(client.action('applications', id, 'status', { student: 'other' }));
  await assert.rejects(client.resource('unknown'));
  await assert.rejects(client.studentService(id, 'insurance', { password: 'bad' }));
  assert.equal(calls, 0);
});
test('accepted update uses exact website path and body, without automatic retry', async () => {
  const calls = [];
  const client = createWebsiteClient({ config, fetchImpl: async (url, options) => { calls.push({ url, options }); return response({ status: 'accepted' }); } });
  await client.action('applications', id, 'status', { detailedStatus: 'final-admission', note: 'Reviewed' });
  assert.equal(calls[0].url, `https://website.example/api/applications/${id}/status`);
  assert.equal(calls[0].options.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[0].options.body), { detailedStatus: 'final-admission', note: 'Reviewed' });
  assert.equal(calls.length, 1);
});
test('upstream authorization failure is visible; never returned as an empty list', async () => {
  const client = createWebsiteClient({ config, fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) }) });
  await assert.rejects(client.resource('applications'), error => error.status === 403);
});
test('private attachment link requests do not expose API credentials', async () => {
  const client = createWebsiteClient({ config, fetchImpl: async (url, options) => {
    assert.equal(url, `https://website.example/api/documents/${id}/access`);
    assert.equal(options.method, 'POST');
    return response({ url: 'https://files.example/signed-link' });
  } });
  assert.deepEqual(await client.attachment('documents', id), { url: 'https://files.example/signed-link' });
});
test('route access uses CRM module permissions and disabled writes never reach website or CRM', async () => {
  const routes = [];
  const app = { get: (...args) => routes.push(args), post: (...args) => routes.push(args), put: (...args) => routes.push(args) };
  let permission;
  let writes = 0;
  const previous = process.env.STUDY_BIRDS_ALLOW_WRITES;
  process.env.STUDY_BIRDS_ALLOW_WRITES = 'false';
  try {
    mountWebsiteRoutes(app, { allowAction: () => () => {}, allowModule: module => { permission = module; return () => {}; }, client: { action: async () => { writes++; } }, readDb: async () => ({}), mutateDb: async () => { writes++; } });
    assert.equal(permission, 'website');
    const writeRoute = routes.find(row => row[0].endsWith('/:action'));
    let error;
    await writeRoute.at(-1)({ params: { resource: 'applications', id, action: 'status' }, body: {}, user: {} }, {}, e => { error = e; });
    assert.equal(error.status, 403);
    assert.equal(writes, 0);
  } finally {
    if (previous === undefined) delete process.env.STUDY_BIRDS_ALLOW_WRITES; else process.env.STUDY_BIRDS_ALLOW_WRITES = previous;
  }
});
test('successful gateway action keeps independent CRM records intact and audits the actor', async () => {
  const routes = [];
  const app = { get: (...args) => routes.push(args), post: (...args) => routes.push(args), put: (...args) => routes.push(args) };
  const db = { students: [{ id: 'local-student' }], applications: [{ id: 'local-application' }], educationCatalog: { programs: [{ id: 'local-program' }] } };
  const snapshot = JSON.stringify(db);
  let remoteCalls = 0;
  const previous = process.env.STUDY_BIRDS_ALLOW_WRITES;
  process.env.STUDY_BIRDS_ALLOW_WRITES = 'true';
  try {
    mountWebsiteRoutes(app, { allowAction: () => () => {}, allowModule: () => () => {}, client: { action: async () => { remoteCalls++; return { updated: true }; } }, readDb: async () => db, mutateDb: async fn => fn(db) });
    const route = routes.find(row => row[0].endsWith('/:action'));
    let error;
    await route.at(-1)({ params: { resource: 'applications', id, action: 'status' }, body: { detailedStatus: 'submitted' }, user: { companyId: 'company', sub: 'actor' } }, { json: data => assert.equal(data.updated, true) }, e => { error = e; });
    assert.equal(error, undefined);
    assert.equal(remoteCalls, 1);
    const { websiteIntegrationLog, ...independent } = db;
    assert.equal(JSON.stringify(independent), snapshot);
    assert.equal(websiteIntegrationLog[0].userId, 'actor');
    assert.equal(websiteIntegrationLog[0].status, 'completed');
  } finally {
    if (previous === undefined) delete process.env.STUDY_BIRDS_ALLOW_WRITES; else process.env.STUDY_BIRDS_ALLOW_WRITES = previous;
  }
});
