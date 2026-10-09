import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebsiteClient } from './website.service.js';
const id = 'a'.repeat(24);
const config = () => ({ enabled: true, ready: true, baseUrl: 'https://website.example/api', token: 'test' });
const response = data => ({ ok: true, status: 200, json: async () => data });
test('editing a university preserves articles, gallery, tuition and student counts outside the editor', async () => {
  let payload;
  const original = { _id: id, name: 'University', country: { _id: 'b'.repeat(24), name: 'Turkey' }, articleTitle: 'Keep article', articleHeadings: ['Keep heading'], articleBodies: ['Keep body'], campusImages: ['https://files.example/image.png'], tuitionRange: { min: 1000, max: 5000 }, studentCount: 2000, specialtyCount: 20 };
  const client = createWebsiteClient({ config, fetchImpl: async (_url, options) => { if (options.method === 'PUT') { payload = JSON.parse(options.body); return response(payload); } return response(original); } });
  await client.editResource('universities', id, { city: 'New city' });
  assert.equal(payload.city, 'New city');
  assert.equal(payload.articleTitle, original.articleTitle);
  assert.deepEqual(payload.articleBodies, original.articleBodies);
  assert.deepEqual(payload.campusImages, original.campusImages);
  assert.deepEqual(payload.tuitionRange, original.tuitionRange);
  assert.equal(payload.studentCount, 2000);
  assert.equal(payload.country, original.country._id);
  assert.equal(payload._id, undefined);
});
test('content editor rejects fields outside the whitelist before any remote request', async () => {
  let requests = 0;
  const client = createWebsiteClient({ config, fetchImpl: async () => { requests++; return response({}); } });
  await assert.rejects(client.editResource('universities', id, { student: id }));
  await assert.rejects(client.editResource('applications', id, { status: 'accepted' }));
  assert.equal(requests, 0);
});
