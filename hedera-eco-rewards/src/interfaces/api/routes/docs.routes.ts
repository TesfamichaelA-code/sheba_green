import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from '../docs/openapi.config';

/**
 * Documentation Routes
 * 
 * Provides API documentation endpoints using Swagger UI
 * Requirements: 6.2, 6.6
 */

const router = Router();

/**
 * @swagger
 * /docs:
 *   get:
 *     summary: API Documentation
 *     description: Interactive API documentation using Swagger UI
 *     tags: [Documentation]
 *     responses:
 *       200:
 *         description: API documentation page
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 */

// Swagger UI options
const swaggerOptions = {
  explorer: true,
  swaggerOptions: {
    docExpansion: 'none',
    filter: true,
    showRequestDuration: true,
    tryItOutEnabled: true,
    requestInterceptor: (req: any) => {
      // Add API version header to all requests
      req.headers['API-Version'] = 'v1';
      return req;
    },
  },
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info .title { color: #2c5530 }
    .swagger-ui .scheme-container { background: #f8f9fa; padding: 10px; border-radius: 4px; }
  `,
  customSiteTitle: 'Hedera Eco-Rewards API Documentation',
};

// Serve Swagger UI
router.use('/', swaggerUi.serve);
router.get('/', swaggerUi.setup(swaggerSpec, swaggerOptions));

/**
 * @swagger
 * /docs/json:
 *   get:
 *     summary: OpenAPI Specification (JSON)
 *     description: Returns the OpenAPI specification in JSON format
 *     tags: [Documentation]
 *     responses:
 *       200:
 *         description: OpenAPI specification
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.get('/json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

/**
 * @swagger
 * /docs/yaml:
 *   get:
 *     summary: OpenAPI Specification (YAML)
 *     description: Returns the OpenAPI specification in YAML format
 *     tags: [Documentation]
 *     responses:
 *       200:
 *         description: OpenAPI specification
 *         content:
 *           application/yaml:
 *             schema:
 *               type: string
 */
router.get('/yaml', (req, res) => {
  const yaml = require('js-yaml');
  res.setHeader('Content-Type', 'application/yaml');
  res.send(yaml.dump(swaggerSpec));
});

/**
 * Health check for documentation service
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'API Documentation',
    version: swaggerSpec.info.version,
    timestamp: new Date().toISOString(),
  });
});

export { router as docsRouter };