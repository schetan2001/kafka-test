const { v4: uuidv4 } = require('uuid');
const { requestContext, baseLogger } = require('./logger.js');

function extractSystemId(body) {
    if (!body || typeof body !== 'object') return '[not-present]';

    // 1. GraphQL variables
    if (body.variables?.systemId) return String(body.variables.systemId);

    // 2. REST body top-level
    if (body.systemId) return String(body.systemId);

    // 3. Inline in GraphQL query string — simple regex
    if (typeof body.query === 'string') {
        const match = body.query.match(/systemId\s*:\s*"([^"]+)"/);
        if (match) return match[1];
    }

    return '[not-present]';
}

function extractGraphQLDetails(body) {
    const result = { systemId: '[not-present]', operationName: null };

    if (!body || typeof body !== 'object') return result;

    try {
        if (body.query) {
            // GraphQL request
            result.operationName = body.operationName || '[anonymous]';
            result.systemId = extractSystemId(body);
        } else if (body.systemId) {
            // Plain REST POST with systemId at top level
            result.systemId = String(body.systemId);
        }
    } catch {
        // ignore parse errors
    }

    return result;
}

function requestLogger(req, res, next) {
    const correlationId = req.headers['x-correlation-id'] || uuidv4();
    const appId = req.headers['app_id'] || '[not-present]';

    // Echo correlationId back so clients can see it
    res.setHeader('x-correlation-id', correlationId);

    const start = process.hrtime.bigint();

    // Extract GraphQL/REST details from body BEFORE logging ENTRY
    const { systemId, operationName } = extractGraphQLDetails(req.body);
    const store = requestContext.getStore();
    if (store) {
        store.operationName = operationName || '[anonymous]';
        store.systemId = systemId || '[not-present]';
    }

    // Run the rest of the request inside this async context
    requestContext.run({ correlationId, appId, systemId, operationName }, () => {
        const logger = baseLogger.child({ correlationId, appId });

        // ENTRY log
        logger.info({
            event: 'ENTRY',
            method: req.method,
            path: req.originalUrl,
            clientIp: req.ip || req.headers['x-forwarded-for'],
            userAgent: req.headers['user-agent'],
            systemId,
            operationName,
        }, 'Request received');

        // EXIT log — fires when response is sent
        res.on('finish', () => {
            const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;

            logger.info({
                event: 'EXIT',
                method: req.method,
                path: req.originalUrl,
                statusCode: res.statusCode,
                durationMs: Math.round(durationMs * 100) / 100,
                systemId: systemId,
                operationName: operationName,
            }, 'Request completed');
        });

        next();
    });
}

module.exports = { requestLogger };
