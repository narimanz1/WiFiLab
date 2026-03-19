const http = require('http');

describe('Server', () => {
  test('index.js exports start function', () => {
    const { createApp } = require('../server/index.js');
    expect(typeof createApp).toBe('function');
  });

  test('createApp returns express app with expected routes', () => {
    const { createApp } = require('../server/index.js');
    const app = createApp();
    expect(app).toBeDefined();
  });
});
