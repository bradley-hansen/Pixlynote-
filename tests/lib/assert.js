'use strict';

function makeAssert() {
  return {
    ok(cond, msg) {
      if (!cond) throw new Error(msg || 'assertion failed');
    },
    equal(a, b, msg) {
      if (a !== b) throw new Error((msg || 'expected values to be equal') + ` (got ${JSON.stringify(a)} vs ${JSON.stringify(b)})`);
    },
    match(str, re, msg) {
      if (!re.test(String(str || ''))) throw new Error((msg || 'expected match') + ` (got ${JSON.stringify(str)})`);
    },
    truthy(v, msg) { this.ok(!!v, msg); }
  };
}

module.exports = { makeAssert };
