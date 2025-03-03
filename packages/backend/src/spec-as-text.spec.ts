import { expect, test } from 'vitest';

import appsv1 from '../tests/openapi-dump/openapi/v3/apis/apps/v1.json';
import { validate } from '@scalar/openapi-parser';
import type { OpenAPIV3 } from 'openapi-types';
import { getSimplifiedSpec } from './spec-as-text';
import { SimplifiedSpec } from '/@shared/src/models/SimplifiedSpec';

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
  const simple = getSimplifiedSpec(spec, '', { prefix: [], pathInSpec: []});

  expect(simple.description).toBe('Deployment enables declarative updates for Pods and ReplicaSets.');
  expect(simple.children).toHaveLength(5);
  expect(simple.children.map(child => child.name)).toEqual(['apiVersion', 'kind', 'metadata', 'spec', 'status']);
  const metadata = simple.children.find(child => child.name === 'metadata');
  if (!metadata) {
    throw new Error('metadata not found');
  }
  expect(metadata.children).toHaveLength(15);
  expect(metadata.children.map(child => child.name)).toEqual([
    'metadata.annotations',
    'metadata.creationTimestamp',
    'metadata.deletionGracePeriodSeconds',
    'metadata.deletionTimestamp',
    'metadata.finalizers',
    'metadata.generateName',
    'metadata.generation',
    'metadata.labels',
    'metadata.managedFields',
    'metadata.name',
    'metadata.namespace',
    'metadata.ownerReferences',
    'metadata.resourceVersion',
    'metadata.selfLink',
    'metadata.uid',
  ]);
  const ownerReferences = metadata.children.find(child => child.name === 'metadata.ownerReferences');
  if (!ownerReferences) {
    throw new Error('ownerReferences not found');
  }
  expect(ownerReferences.children).toHaveLength(6);
  expect(ownerReferences.children.map(child => child.name)).toEqual([
    'metadata.ownerReferences[].apiVersion',
    'metadata.ownerReferences[].blockOwnerDeletion',
    'metadata.ownerReferences[].controller',
    'metadata.ownerReferences[].kind',
    'metadata.ownerReferences[].name',
    'metadata.ownerReferences[].uid',
  ]);
});

test('deployment with pathInSpec kind', async () => {
  const result = await validate(appsv1);
  if (!result.valid) {
    throw new Error(`invalid spec`);
  }
  const document: OpenAPIV3.Document = result.schema;
  const spec = document.components?.schemas?.['io.k8s.api.apps.v1.Deployment'];
  if (!spec) {
    throw new Error('Deployment spec not found');
  }
  const simple = getSimplifiedSpec(spec, '', { prefix: [], pathInSpec: ['kind']});
  expect(simple.type).toBe('string');
  expect(simple.description).toBe('Kind is a string value representing the REST resource this object represents. Servers may infer this from the endpoint the client submits requests to. Cannot be updated. In CamelCase. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds');
  expect(simple.children).toHaveLength(0);
});

test('deployment with pathInSpec metadata', async () => {
  const result = await validate(appsv1);
  if (!result.valid) {
    throw new Error(`invalid spec`);
  }
  const document: OpenAPIV3.Document = result.schema;
  const spec = document.components?.schemas?.['io.k8s.api.apps.v1.Deployment'];
  if (!spec) {
    throw new Error('Deployment spec not found');
  }
  const simple = getSimplifiedSpec(spec, '', { prefix: [], pathInSpec: ['metadata']});
  expect(simple.type).toBe('');
  expect(simple.description).toBe(`Standard object's metadata. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#metadata
ObjectMeta is metadata that all persisted resources must have, which includes all objects users must create.`);
  expect(simple.children).toHaveLength(15);
  expect(simple.children.map(child => child.name)).toEqual([
    'annotations',
    'creationTimestamp',
    'deletionGracePeriodSeconds',
    'deletionTimestamp',
    'finalizers',
    'generateName',
    'generation',
    'labels',
    'managedFields',
    'name',
    'namespace',
    'ownerReferences',
    'resourceVersion',
    'selfLink',
    'uid',
  ]);
});


test('deployment with pathInSpec metadata.name', async () => {
  const result = await validate(appsv1);
  if (!result.valid) {
    throw new Error(`invalid spec`);
  }
  const document: OpenAPIV3.Document = result.schema;
  const spec = document.components?.schemas?.['io.k8s.api.apps.v1.Deployment'];
  if (!spec) {
    throw new Error('Deployment spec not found');
  }
  const simple = getSimplifiedSpec(spec, '', { prefix: [], pathInSpec: ['metadata', 'name']});
  expect(simple.type).toBe('string');
  expect(simple.description).toBe(`Name must be unique within a namespace. Is required when creating resources, although some resources may allow a client to request the generation of an appropriate name automatically. Name is primarily intended for creation idempotence and configuration definition. Cannot be updated. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names#names`);
  expect(simple.children).toHaveLength(0);
});

test('deployment with pathInSpec metadata.ownerReferences', async () => {
  const result = await validate(appsv1);
  if (!result.valid) {
    throw new Error(`invalid spec`);
  }
  const document: OpenAPIV3.Document = result.schema;
  const spec = document.components?.schemas?.['io.k8s.api.apps.v1.Deployment'];
  if (!spec) {
    throw new Error('Deployment spec not found');
  }
  const simple = getSimplifiedSpec(spec, '', { prefix: [], pathInSpec: ['metadata', 'ownerReferences']});
  expect(simple.type).toBe('[]object');
  expect(simple.description).toBe(`List of objects depended by this object. If ALL objects in the list have been deleted, this object will be garbage collected. If this object is managed by a controller, then an entry in this list will point to this controller, with the controller field set to true. There cannot be more than one managing controller.
OwnerReference contains enough information to let you identify an owning object. An owning object must be in the same namespace as the dependent, or be cluster-scoped, so there is no namespace field.`);
  expect(simple.children).toHaveLength(6);
  expect(simple.children.map(child => child.name)).toEqual([
    'apiVersion',
    'blockOwnerDeletion',
    'controller',
    'kind',
    'name',
    'uid',
  ]);
});

test('deployment with pathInSpec metadata.ownerReferences.apiVersion', async () => {
  const result = await validate(appsv1);
  if (!result.valid) {
    throw new Error(`invalid spec`);
  }
  const document: OpenAPIV3.Document = result.schema;
  const spec = document.components?.schemas?.['io.k8s.api.apps.v1.Deployment'];
  if (!spec) {
    throw new Error('Deployment spec not found');
  }
  const simple = getSimplifiedSpec(spec, '', { prefix: [], pathInSpec: ['metadata', 'ownerReferences', 'apiVersion']});
  expect(simple.type).toBe('string');
  expect(simple.description).toBe(`API version of the referent.`);
  expect(simple.children).toHaveLength(0);
});
