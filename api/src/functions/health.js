const { app } = require('@azure/functions');

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async () => {
    return {
      status: 200,
      jsonBody: {
        ok: true,
        service: 'lacolline-farm-api',
        timestamp: new Date().toISOString()
      }
    };
  }
});
