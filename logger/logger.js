const pino = require('pino');
const { AsyncLocalStorage } = require('async_hooks');

// Per-request context — carries correlationId across async calls
const requestContext = new AsyncLocalStorage();

const baseLogger = pino({
    level: process.env.LOG_LEVEL || 'info',
    base: {
        service: 'fulfilment-layer',
        environment: process.env.NODE_ENV || 'uat',
    },
    formatters: {
        level: (label) => ({ level: label.toUpperCase() }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
});

// Wrapper that auto-injects correlationId from async context
function getLogger() {
    const ctx = requestContext.getStore();
    if (ctx) {
        return baseLogger.child({
            correlationId: ctx.correlationId,
            appId: ctx.appId,
            systemId: ctx.systemId,
        });
    }
    return baseLogger;
}

module.exports = { getLogger, requestContext, baseLogger };