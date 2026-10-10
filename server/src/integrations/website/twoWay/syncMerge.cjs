const { createHash } = require('node:crypto');
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (plain(value)) return Object.fromEntries(Object.keys(value).sort().map(key => {
    if (forbidden.has(key) || key.startsWith('$') || key.includes('.')) throw new Error('Unsafe sync field');
    return [key, canonical(value[key])];
  }));
  return value;
}
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

// Three-way merge. Arrays are atomic; overlapping changes never select a winner.
function merge(base, local, remote) {
  const conflicts = [];
  function visit(b, l, r, path) {
    if (equal(l, r)) return structuredClone(l);
    if (equal(l, b)) return structuredClone(r);
    if (equal(r, b)) return structuredClone(l);
    if (plain(l) && plain(r) && (plain(b) || b === undefined)) {
      const result = {};
      for (const key of new Set([...Object.keys(b || {}), ...Object.keys(l), ...Object.keys(r)])) {
        if (forbidden.has(key) || key.startsWith('$') || key.includes('.')) throw new Error('Unsafe sync field');
        const value = visit(b?.[key], own(l, key) ? l[key] : undefined, own(r, key) ? r[key] : undefined, [...path, key]);
        if (value !== undefined) result[key] = value;
      }
      return result;
    }
    conflicts.push({ path: path.join('/'), base: b, local: l, remote: r });
    return structuredClone(l);
  }
  const value = visit(base, local, remote, []);
  return { value, conflicts };
}
module.exports = { merge, digest, equal, canonical };
