import { test } from 'vitest';

import appsv1 from '../tests/openapi-dump/openapi/v3/apis/apps/v1.json';
import { validate } from '@scalar/openapi-parser';
import type { OpenAPIV3 } from 'openapi-types';
import { getSimplifiedSpec } from './spec-as-text';

test('deployment', async () => {
    const result = await validate(appsv1);
    if (!result.valid) {
      throw new Error(`invalid spec`);
    }
    const document: OpenAPIV3.Document = result.schema;
    const spec = document.components?.schemas?.['io.k8s.api.apps.v1.Deployment'];
    if (!spec) {
      throw new Error('Deployment spec not found');
    }
    const simple = getSimplifiedSpec(spec, '', { prefix: []});
    console.log('==> ', JSON.stringify(simple, undefined, '  '));
  });
