import type { OpenAPIV3 } from 'openapi-types';
import type{ SimplifiedSpec } from '/@shared/src/models/SimplifiedSpec';

interface Options {
  pathInSpec: string[];
  prefix: string[];
}

export function getSimplifiedSpec(spec: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject, name: string, options: Options): SimplifiedSpec {
  if (isReferenceObject(spec)) {
    throw new Error('reference');
  }

  if (options.pathInSpec.length) {
    const firstPath = options.pathInSpec[0];
    if (spec.type === 'object' && !!spec.properties) {
      return getSimplifiedSpec(spec.properties[firstPath], name, {
        prefix: options.prefix,
        pathInSpec: options.pathInSpec.slice(1),
      });
    } else if (spec.allOf) {
      return getSimplifiedSpec(spec.allOf[0], '', {
        pathInSpec: options.pathInSpec,
        prefix: options?.prefix,
      });
    } else if (isArraySchemaObject(spec)) {
      return getSimplifiedSpec(spec.items, '', {
        pathInSpec: options.pathInSpec,
        prefix: options.prefix,
      });
    } else {
      console.error('==> unknown path');
    }
  }
  
  const result: SimplifiedSpec = {
    name: name ?? '',
    type: getType(spec),
    description: spec.description ?? '',
    children: [],
  };

  if (spec.type === 'object' && !!spec.properties) {
    for (const [property, subSpec] of Object.entries(spec.properties)) {
      if (isReferenceObject(subSpec)) {
        throw new Error('reference');
      }
      const newPrefix = [...options.prefix, property];
      const childName = newPrefix.join('.');
      result.children.push(getSimplifiedSpec(subSpec, childName, {
        pathInSpec: options.pathInSpec,
        prefix: newPrefix,
      }));
    }

  } else if (spec.allOf) {
    if (spec.allOf.length !== 1) {
      throw new Error('more than 1 allOf');
    }
    const of = getSimplifiedSpec(spec.allOf[0], '', {
      pathInSpec: options.pathInSpec,
      prefix: options?.prefix,
    });
    if (of.description) {
      result.description += `\n${of.description}`;
    }
    result.children = of.children;

  } else if (isArraySchemaObject(spec)) {
    const newPrefix = [...options.prefix];
    const lastPrefix = newPrefix.pop();
    if (lastPrefix) {
      newPrefix.push(`${lastPrefix}[]`);
    }
    const item = getSimplifiedSpec(spec.items, '', {
      pathInSpec: options.pathInSpec,
      prefix: newPrefix,
    });
    if (item.description) {
      result.description += item.description;
    }
    result.children = item.children;
  }

  return result;
}

function isReferenceObject(
  spec: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject,
): spec is OpenAPIV3.ReferenceObject {
  return typeof spec === 'object' && '$ref' in spec;
}

function isSchemaObject(
  additionalProperties: undefined | boolean | OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject,
): additionalProperties is OpenAPIV3.SchemaObject {
  return (
    !!additionalProperties &&
    typeof additionalProperties !== 'boolean' &&
    'type' in additionalProperties
  );
}

function isArraySchemaObject(spec: OpenAPIV3.SchemaObject): spec is OpenAPIV3.ArraySchemaObject {
  return spec.type === 'array';
}

function getType(spec: OpenAPIV3.SchemaObject, _options?: { subtype: boolean }): string {
  if (!spec.type) {
    return '';
  }
  let type = `${spec.type}`;
  if (spec.type === 'array' && !isReferenceObject(spec.items)) {
    if (spec.items.allOf?.[0] && !isReferenceObject(spec.items.allOf[0])) {
      type = `[]${getType(spec.items.allOf[0], { subtype: true })}`;
    } else {
      type = `[]${getType(spec.items, { subtype: true })}`;
    }
  }
  if (type === 'object' && isSchemaObject(spec.additionalProperties)) {
    let subtype = `${spec.additionalProperties.type}`;
    if (spec.additionalProperties.format === 'byte') {
      subtype = '[]byte';
    }
    type = `map[string]${subtype}`;
  }
  if (type) {
    return type;
  }
  return '';
}
