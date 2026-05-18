'use strict';
const crypto = require('crypto');

function hashContent(content) {
  return crypto.createHash('sha256')
    .update(typeof content === 'string' ? content : JSON.stringify(content))
    .digest('hex').substring(0, 32);
}

function hashUrl(url) {
  return crypto.createHash('sha256').update(url).digest('hex').substring(0, 32);
}

module.exports = { hashContent, hashUrl };
